import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { spawn } from 'node:child_process';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'brick-parent-v5b-'));
const bundled = path.join(dir, 'parent-v5b.mjs');
const browserScript = path.join(dir, 'dashboard-browser.mjs');

try {
  await build({
    entryPoints: ['src/parent-v5b.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: ['node24'],
    outfile: bundled
  });
  const mod = await import(pathToFileURL(bundled).href + `?v=${Date.now()}`);
  const html = mod.parentV5BHtml();
  if (typeof html !== 'string' || html.length < 10_000) throw new Error('Phase 5B dashboard did not render a complete HTML document');

  const required = [
    '/parent-assets/brick-map.mjs',
    '/parent-assets/maplibre-gl.css',
    '/parent/map/basemap.pmtiles',
    'Map · checking private archive'
  ];
  for (const value of required) if (!html.includes(value)) throw new Error(`Missing Phase 5B dashboard invariant: ${value}`);

  const forbidden = [
    'unpkg.com/maplibre-gl',
    'demotiles.maplibre.org',
    'nominatim.openstreetmap.org',
    'maps.googleapis.com',
    'maps.google.com'
  ];
  for (const value of forbidden) if (html.includes(value)) throw new Error(`Privacy regression: live parent HTML contains ${value}`);

  const match = html.match(/<script\s+type=["']module["']>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Could not find Phase 5B parent dashboard module script');
  await fs.writeFile(browserScript, match[1], 'utf8');
  const exitCode = await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--check', browserScript], { stdio: 'inherit' });
    p.on('error', reject);
    p.on('exit', code => resolve(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`Phase 5B parent dashboard module syntax check failed (${exitCode})`);
  console.log('Phase 5B private-map dashboard render + privacy + module syntax OK');
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
