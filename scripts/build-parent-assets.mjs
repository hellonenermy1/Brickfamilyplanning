import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const out = path.resolve('public');
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });

// Phase 8B production map entry: OneMap-first MapLibre renderer with private PMTiles fallback.
await build({
  entryPoints: ['web/brick-map-p8b.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  sourcemap: false,
  outfile: path.join(out, 'brick-map.mjs')
});

await build({
  entryPoints: ['web/brick-pair.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  sourcemap: false,
  outfile: path.join(out, 'brick-pair.mjs')
});

await fs.copyFile('node_modules/maplibre-gl/dist/maplibre-gl.css', path.join(out, 'maplibre-gl.css'));
await fs.copyFile('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', path.join(out, 'maplibre-gl-worker.mjs'));
await fs.writeFile(path.join(out, '_headers'), `/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n`);

console.log('Built OneMap-first parent map, private fallback and pairing assets in public/');
