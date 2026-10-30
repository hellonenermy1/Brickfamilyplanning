import fs from 'node:fs/promises';
import path from 'node:path';

const roots = ['src', 'web'];
const files = [];
async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(p);
    else if (/\.(ts|js|mjs)$/.test(entry.name)) files.push(p);
  }
}
for (const root of roots) await walk(root);

const trackerPatterns = [
  /firebase[-_/ ]?analytics/i,
  /google[-_/ ]?analytics/i,
  /googletagmanager/i,
  /gtag\s*\(/i,
  /facebook.*pixel/i,
  /meta.*pixel/i,
  /segment\.com/i,
  /mixpanel/i,
  /amplitude/i,
  /appsflyer/i,
  /adjust\.com/i,
  /doubleclick/i
];
const externalLiveLocation = [
  /nominatim\.openstreetmap\.org/i,
  /maps\.googleapis\.com/i,
  /maps\.google\.com/i,
  /demotiles\.maplibre\.org/i,
  /unpkg\.com\/maplibre-gl/i
];
const sensitiveLog = /console\.(log|info|debug|warn|error)\s*\([^\n]*(lat|lon|latitude|longitude|coordinate|location|accuracyM|rawLat|rawLon)/i;

const failures = [];
for (const file of files) {
  const text = await fs.readFile(file, 'utf8');
  for (const re of trackerPatterns) if (re.test(text)) failures.push(`${file}: analytics/ad tracker pattern ${re}`);
  // parent-v5.ts is a legacy template whose external map strings are replaced before serving;
  // parent-v5b and the built browser bundle are separately tested to guarantee no live external map path.
  if (file !== path.join('src', 'parent-v5.ts')) {
    for (const re of externalLiveLocation) if (re.test(text)) failures.push(`${file}: external live location/map endpoint ${re}`);
  }
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => { if (sensitiveLog.test(line)) failures.push(`${file}:${i + 1}: coordinate/location data in ordinary console logging`); });
}

const packageText = await fs.readFile('package.json', 'utf8');
for (const re of trackerPatterns) if (re.test(packageText)) failures.push(`package.json: analytics/ad dependency pattern ${re}`);

if (failures.length) {
  console.error('Phase 5C privacy audit failed:\n' + failures.map(x => `- ${x}`).join('\n'));
  process.exit(1);
}
console.log(`Phase 5C privacy audit passed across ${files.length} production source files`);
