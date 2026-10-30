import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const MAP_DB = 'brick-family-v1-map';
const BBOX = process.env.BRICK_MAP_BBOX || '103.55,1.12,104.12,1.50';
const MAX_ZOOM = process.env.BRICK_MAP_MAXZOOM || '15';
const PMTILES_IMAGE = 'ghcr.io/protomaps/go-pmtiles:v1.31.2';
const D1_CHUNK_BYTES = 32 * 1024;
const SQL_BATCH_CHUNKS = 80;
const MAP_DB_SAFE_BYTES = 420 * 1024 * 1024;
const cacheDir = path.resolve('.brick-map-cache');
const outFile = path.join(cacheDir, 'singapore.pmtiles');
const sqlDir = path.join(cacheDir, 'd1-sql');

function run(cmd,args,{capture=false}={}){return new Promise((resolve,reject)=>{const p=spawn(cmd,args,{shell:process.platform==='win32',env:{...process.env},stdio:capture?['ignore','pipe','pipe']:'inherit'});let out='',err='';if(capture){p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d)}p.on('error',reject);p.on('exit',code=>code===0?resolve(out):reject(new Error(`${cmd} exited ${code}${err?`: ${err.slice(-1200)}`:''}`)))})}
async function hasCommand(cmd){try{await run(process.platform==='win32'?'where':'which',[cmd],{capture:true});return true}catch{return false}}
function ymd(date){return date.toISOString().slice(0,10).replaceAll('-','')}
async function findSource(){if(process.env.BRICK_MAP_SOURCE)return process.env.BRICK_MAP_SOURCE;for(let days=1;days<=14;days++){const d=new Date(Date.now()-days*86_400_000),url=`https://build.protomaps.com/${ymd(d)}.pmtiles`;try{const r=await fetch(url,{method:'HEAD',redirect:'follow'});if(r.ok)return url}catch{}}throw new Error('Could not find a recent Protomaps daily build. Set BRICK_MAP_SOURCE to a PMTiles URL.')}
function sqlString(value){return `'${String(value).replaceAll("'","''")}'`}
function sha(bytes){return crypto.createHash('sha256').update(bytes).digest('hex')}

if(!(await fs.stat('wrangler.jsonc').catch(()=>null)))throw new Error('wrangler.jsonc is missing. Run npm run setup first.');
await fs.mkdir(cacheDir,{recursive:true});await fs.rm(sqlDir,{recursive:true,force:true});await fs.mkdir(sqlDir,{recursive:true});
const source=await findSource();
console.log(`Using OSM-derived basemap source: ${source}`);
console.log(`Extracting Singapore bbox ${BBOX}, zoom 0-${MAX_ZOOM}. Live parent views remain inside Brick; this source is used only during provisioning.`);
const hasPmtiles=await hasCommand('pmtiles'),hasDocker=!hasPmtiles&&await hasCommand('docker');if(!hasPmtiles&&!hasDocker)throw new Error('Install pmtiles CLI or Docker. Brick will not use a third-party live map fallback.');
if(hasPmtiles){await run('pmtiles',['extract',source,outFile,`--bbox=${BBOX}`,`--maxzoom=${MAX_ZOOM}`,'--download-threads=8']);await run('pmtiles',['verify',outFile])}else{const mount=`${cacheDir}:/data`;await run('docker',['run','--rm','-v',mount,PMTILES_IMAGE,'extract',source,'/data/singapore.pmtiles',`--bbox=${BBOX}`,`--maxzoom=${MAX_ZOOM}`,'--download-threads=8']);await run('docker',['run','--rm','-v',mount,PMTILES_IMAGE,'verify','/data/singapore.pmtiles'])}
const stat=await fs.stat(outFile);if(stat.size<1_000_000)throw new Error(`Extracted PMTiles file is unexpectedly small (${stat.size} bytes).`);if(stat.size>MAP_DB_SAFE_BYTES)throw new Error(`Extracted map is ${(stat.size/1024/1024).toFixed(1)} MiB. Brick reserves headroom under D1's 500 MiB per-database free limit, so this archive is too large for the no-R2 backend. Narrow BRICK_MAP_BBOX or intentionally lower BRICK_MAP_MAXZOOM, then rerun.`);
const file=await fs.open(outFile,'r');const totalChunks=Math.ceil(stat.size/D1_CHUNK_BYTES),wholeHash=crypto.createHash('sha256');let batch=[];let batchIndex=0;
try{
  for(let i=0;i<totalChunks;i++){
    const offset=i*D1_CHUNK_BYTES,length=Math.min(D1_CHUNK_BYTES,stat.size-offset),buf=Buffer.allocUnsafe(length);await file.read(buf,0,length,offset);wholeHash.update(buf);
    batch.push(`INSERT INTO map_chunks(chunk_index,body,byte_length,sha256_hex) VALUES(${i},X'${buf.toString('hex')}',${length},'${sha(buf)}');`);
    if(batch.length>=SQL_BATCH_CHUNKS||i===totalChunks-1){await fs.writeFile(path.join(sqlDir,`chunks-${String(batchIndex++).padStart(4,'0')}.sql`),batch.join('\n'));batch=[]}
  }
}finally{await file.close()}
const mapHash=wholeHash.digest('hex');const metadata={region:'singapore',bbox:BBOX.split(',').map(Number),maxZoom:Number(MAX_ZOOM),source,sourceType:'Protomaps OSM-derived daily basemap',installedAt:new Date().toISOString(),bytes:stat.size,storageBackend:'D1 chunk store',chunkBytes:D1_CHUNK_BYTES,chunkCount:totalChunks,attribution:'© OpenStreetMap contributors · Protomaps'};
const npx=process.platform==='win32'?'npx.cmd':'npx';const resetFile=path.join(sqlDir,'000-reset.sql');await fs.writeFile(resetFile,'DELETE FROM map_manifest;\nDELETE FROM map_chunks;\n');
console.log(`Loading ${(stat.size/1024/1024).toFixed(1)} MiB into ${MAP_DB} as ${totalChunks} verified chunks…`);await run(npx,['wrangler','d1','execute',MAP_DB,'--remote','--file',resetFile,'--yes','--config','wrangler.jsonc']);
const chunkFiles=(await fs.readdir(sqlDir)).filter(x=>x.startsWith('chunks-')).sort();for(let i=0;i<chunkFiles.length;i++){console.log(`Uploading D1 chunk batch ${i+1}/${chunkFiles.length}…`);await run(npx,['wrangler','d1','execute',MAP_DB,'--remote','--file',path.join(sqlDir,chunkFiles[i]),'--yes','--config','wrangler.jsonc'])}
const manifestFile=path.join(sqlDir,'zzz-manifest.sql');await fs.writeFile(manifestFile,`INSERT OR REPLACE INTO map_manifest(id,total_bytes,chunk_bytes,chunk_count,sha256_hex,metadata_json,installed_at) VALUES(1,${stat.size},${D1_CHUNK_BYTES},${totalChunks},'${mapHash}',${sqlString(JSON.stringify(metadata))},${Date.now()});\n`);await run(npx,['wrangler','d1','execute',MAP_DB,'--remote','--file',manifestFile,'--yes','--config','wrangler.jsonc']);
console.log(`Private Singapore basemap installed in ${MAP_DB}: ${(stat.size/1024/1024).toFixed(1)} MiB, ${totalChunks} chunks, sha256 ${mapHash.slice(0,16)}…`);
