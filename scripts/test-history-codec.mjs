import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const target = process.argv[2];
if (!target) throw new Error('Pass compiled codec module path');
const { encodeTrustedDelta, decodeTrustedDelta, gzipJson, readJsonObject } = await import(pathToFileURL(target).href);

const points = [
  { epoch:7, sequence:100, wallTimeMs:1000000, trustedLatE7:13520000, trustedLonE7:1038198000, uncertaintyCm:500, speedCms:120, speedAccuracyCms:40, bearingCdeg:9000, batteryPct:72, charging:false, activity:2, activityConfidence:90, quality:1, source:1, fallback:false, rawAccepted:true },
  { epoch:7, sequence:101, wallTimeMs:1003000, trustedLatE7:13520007, trustedLonE7:1038198020, uncertaintyCm:550, speedCms:125, speedAccuracyCms:42, bearingCdeg:9050, batteryPct:72, charging:false, activity:2, activityConfidence:91, quality:1, source:1, fallback:false, rawAccepted:true },
  { epoch:7, sequence:102, wallTimeMs:1006000, trustedLatE7:null, trustedLonE7:null, uncertaintyCm:8000, speedCms:null, speedAccuracyCms:null, bearingCdeg:null, batteryPct:71, charging:false, activity:0, activityConfidence:0, quality:7, source:0, fallback:false, rawAccepted:false },
  { epoch:7, sequence:104, wallTimeMs:1012000, trustedLatE7:13520100, trustedLonE7:1038198200, uncertaintyCm:2400, speedCms:null, speedAccuracyCms:null, bearingCdeg:9100, batteryPct:71, charging:true, activity:2, activityConfidence:75, quality:4, source:2, fallback:true, rawAccepted:false }
];
const encoded = encodeTrustedDelta(points);
assert.deepEqual(decodeTrustedDelta(encoded), points);

const expected = { version:2, points:encoded, note:'Brick history gzip round trip' };
const compressed = await gzipJson(expected);
const mock = {
  httpMetadata: { contentEncoding:'gzip' },
  body: new Blob([compressed]).stream(),
  text: async () => { throw new Error('gzip path should not call text()'); }
};
assert.deepEqual(await readJsonObject(mock), expected);
console.log('History delta + gzip codec round trip OK');
