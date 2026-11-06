// Real synthetic PMTiles v3 and MVT bytes; no downloaded maps or coordinates from a user.
import {PbfWriter} from 'pbf';
import {zxyToTileId} from 'pmtiles';
import {gzipSync} from 'node:zlib';
export const MAP_LON=103.8,MAP_LAT=1.35;
export function inertialPacket(){return {version:2,epoch:1,sequence:1,elapsedRealtimeMs:1000,wallTimeMs:Date.now(),rawLatE7:null,rawLonE7:null,rawAccuracyCm:null,trustedLatE7:MAP_LAT*1e7,trustedLonE7:MAP_LON*1e7,uncertaintyCm:15000,speedCms:null,speedAccuracyCms:null,bearingCdeg:null,bearingAccuracyCdeg:null,altitudeCm:null,verticalAccuracyCm:null,batteryPct:80,charging:false,rawAccepted:false,rawMock:false,fallback:true,activity:2,activityConfidence:80,quality:4,source:2,gnssUsedInFix:0,gnssTotal:0,gnssAverageCn0Tenth:0,stepDelta:0};}
function tile(roads){
 const p=new PbfWriter();
 p.writeMessage(3,(_,layer)=>{layer.writeVarintField(15,2);layer.writeStringField(1,'roads');layer.writeVarintField(5,4096);
  for(const points of roads)layer.writeMessage(2,(points,feature)=>{feature.writeVarintField(3,2);const zz=n=>n<0?-n*2-1:n*2;feature.writePackedVarint(4,[9,zz(points[0][0]),zz(points[0][1]),10,zz(points[1][0]-points[0][0]),zz(points[1][1]-points[0][1])]);},points);
 },null);return p.finish();
}
function variable(n){const b=[];do{let v=n%128;n=Math.floor(n/128);b.push(v+(n?128:0));}while(n);return b;}
export function mapArchive({empty=false,latOffset=0,featureCount=1,tileLengthOverride,gzipTiles=false,gzipRoot=false,tileBytes}={}){
 const z=15,n=2**z,x=Math.floor((MAP_LON+180)/360*n),y=Math.floor((1-Math.asinh(Math.tan(MAP_LAT*Math.PI/180))/Math.PI)/2*n),entries=[];
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
  const tx=x+dx,ty=y+dy;
  const gx=(MAP_LON+180)/360*n,gy=(1-Math.asinh(Math.tan((MAP_LAT+latOffset)*Math.PI/180))/Math.PI)/2*n;
  const px=Math.round((gx-tx)*4096),py=Math.round((gy-ty)*4096);
  const roads=empty?[]:Array.from({length:featureCount},()=>[[px-400,py],[px+400,py]]);
  const raw=tileBytes??tile(roads);
  entries.push({tileId:zxyToTileId(z,tx,ty),bytes:gzipTiles?gzipSync(raw):raw});
 }
 entries.sort((a,b)=>a.tileId-b.tileId);let prev=0;const root=[...variable(entries.length)];for(const e of entries){root.push(...variable(e.tileId-prev));prev=e.tileId;}for(const e of entries)root.push(1);for(const e of entries)root.push(...variable(tileLengthOverride??e.bytes.length));for(let i=0;i<entries.length;i++)root.push(i===0?1:0);
 const h=new Uint8Array(127),v=new DataView(h.buffer);h.set(new TextEncoder().encode('PMTiles'));v.setUint8(7,3);
 const rootBytes=gzipRoot?gzipSync(Uint8Array.from(root)):Uint8Array.from(root);
 const start=127+rootBytes.length,total=entries.reduce((n,e)=>n+e.bytes.length,0);
 for(const [at,value]of [[8,127],[16,rootBytes.length],[24,start],[32,0],[40,start],[48,0],[56,start],[64,total],[72,9],[80,9],[88,9]])v.setBigUint64(at,BigInt(value),true);
 for(const [at,value]of [[96,1],[97,gzipRoot?2:1],[98,gzipTiles?2:1],[99,1],[100,z],[101,z],[118,z]])v.setUint8(at,value);
 const result=new Uint8Array(start+total);result.set(h);result.set(rootBytes,127);let offset=start;for(const e of entries){result.set(e.bytes,offset);offset+=e.bytes.length;}return result;
}
export function mapBucket(bytes,etag='synthetic-map'){
 const calls=[];
 return {calls,async get(key,{range}={}){calls.push({key,...range});const body=bytes.slice(range.offset,range.offset+range.length);return {etag,body:true,async arrayBuffer(){return body.buffer;}};}};
}
