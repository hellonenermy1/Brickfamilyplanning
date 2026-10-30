import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const out = path.resolve('public');
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });

await build({
  entryPoints: ['web/brick-map.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  sourcemap: false,
  outfile: path.join(out, 'brick-map.mjs')
});

await fs.copyFile('node_modules/maplibre-gl/dist/maplibre-gl.css', path.join(out, 'maplibre-gl.css'));
await fs.copyFile('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', path.join(out, 'maplibre-gl-worker.mjs'));
await fs.writeFile(path.join(out, '_headers'), `/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n`);

console.log('Built self-hosted parent map assets in public/');
