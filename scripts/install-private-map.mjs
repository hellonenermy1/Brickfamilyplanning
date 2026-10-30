import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const MAP_BUCKET = 'brick-family-v1-maps';
const MAP_KEY = 'basemap/singapore.pmtiles';
const META_KEY = 'basemap/singapore.meta.json';
const BBOX = process.env.BRICK_MAP_BBOX || '103.55,1.12,104.12,1.50';
const MAX_ZOOM = process.env.BRICK_MAP_MAXZOOM || '15';
const PMTILES_IMAGE = 'ghcr.io/protomaps/go-pmtiles:v1.31.2';
const WRANGLER_SAFE_BYTES = 300 * 1024 * 1024;
const cacheDir = path.resolve('.brick-map-cache');
const outFile = path.join(cacheDir, 'singapore.pmtiles');
const metaFile = path.join(cacheDir, 'singapore.meta.json');

function run(cmd, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { shell: process.platform === 'win32', env: { ...process.env }, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let out = '', err = '';
    if (capture) {
      p.stdout.on('data', d => out += d);
      p.stderr.on('data', d => err += d);
    }
    p.on('error', reject);
    p.on('exit', code => code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}${err ? `: ${err.slice(-1200)}` : ''}`)));
  });
}

async function hasCommand(cmd) {
  try { await run(process.platform === 'win32' ? 'where' : 'which', [cmd], { capture: true }); return true; } catch { return false; }
}
function ymd(date) { return date.toISOString().slice(0, 10).replaceAll('-', ''); }
async function findSource() {
  if (process.env.BRICK_MAP_SOURCE) return process.env.BRICK_MAP_SOURCE;
  for (let days = 1; days <= 14; days++) {
    const d = new Date(Date.now() - days * 86_400_000);
    const url = `https://build.protomaps.com/${ymd(d)}.pmtiles`;
    try {
      const r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      if (r.ok) return url;
    } catch {}
  }
  throw new Error('Could not find a recent Protomaps daily build. Set BRICK_MAP_SOURCE to a PMTiles URL.');
}

await fs.mkdir(cacheDir, { recursive: true });
const source = await findSource();
console.log(`Using OSM-derived basemap source: ${source}`);
console.log(`Extracting Singapore bbox ${BBOX}, zoom 0-${MAX_ZOOM}. This is a one-time map-data download; live child views will use Brick R2 only.`);

const hasPmtiles = await hasCommand('pmtiles');
const hasDocker = !hasPmtiles && await hasCommand('docker');
if (!hasPmtiles && !hasDocker) {
  throw new Error('Install the pmtiles CLI, or Docker. Brick will not silently use a third-party live map fallback.');
}

if (hasPmtiles) {
  await run('pmtiles', ['extract', source, outFile, `--bbox=${BBOX}`, `--maxzoom=${MAX_ZOOM}`, '--download-threads=8']);
  await run('pmtiles', ['verify', outFile]);
} else {
  const mount = `${cacheDir}:/data`;
  await run('docker', ['run', '--rm', '-v', mount, PMTILES_IMAGE, 'extract', source, '/data/singapore.pmtiles', `--bbox=${BBOX}`, `--maxzoom=${MAX_ZOOM}`, '--download-threads=8']);
  await run('docker', ['run', '--rm', '-v', mount, PMTILES_IMAGE, 'verify', '/data/singapore.pmtiles']);
}

const stat = await fs.stat(outFile);
if (stat.size < 1_000_000) throw new Error(`Extracted PMTiles file is unexpectedly small (${stat.size} bytes). Refusing to upload.`);

let uploadMethod = 'wrangler';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
if (stat.size <= WRANGLER_SAFE_BYTES) {
  await run(npx, ['wrangler', 'r2', 'object', 'put', `${MAP_BUCKET}/${MAP_KEY}`, '--remote', '--file', outFile, '--content-type', 'application/vnd.pmtiles', '--cache-control', 'private, max-age=86400', '--config', 'wrangler.jsonc', '--force']);
} else {
  const rcloneRemote = process.env.BRICK_R2_RCLONE_REMOTE?.replace(/\/$/, '');
  if (!rcloneRemote || !(await hasCommand('rclone'))) {
    throw new Error(`Extracted map is ${(stat.size / 1024 / 1024).toFixed(1)} MiB, above Brick's safe Wrangler upload threshold. Configure rclone for R2 and set BRICK_R2_RCLONE_REMOTE (example: r2:brick-family-v1-maps), then rerun. The map file remains at ${outFile}.`);
  }
  uploadMethod = 'rclone-multipart';
  await run('rclone', ['copyto', outFile, `${rcloneRemote}/${MAP_KEY}`, '--s3-chunk-size=64M', '--s3-upload-concurrency=4', '--progress']);
}

const metadata = {
  region: 'singapore',
  bbox: BBOX.split(',').map(Number),
  maxZoom: Number(MAX_ZOOM),
  source,
  sourceType: 'Protomaps OSM-derived daily basemap',
  installedAt: new Date().toISOString(),
  bytes: stat.size,
  uploadMethod,
  attribution: '© OpenStreetMap contributors · Protomaps'
};
await fs.writeFile(metaFile, JSON.stringify(metadata, null, 2));
await run(npx, ['wrangler', 'r2', 'object', 'put', `${MAP_BUCKET}/${META_KEY}`, '--remote', '--file', metaFile, '--content-type', 'application/json', '--cache-control', 'private, max-age=300', '--config', 'wrangler.jsonc', '--force']);

console.log(`Private Singapore basemap installed: ${MAP_BUCKET}/${MAP_KEY} (${(stat.size / 1024 / 1024).toFixed(1)} MiB via ${uploadMethod})`);
