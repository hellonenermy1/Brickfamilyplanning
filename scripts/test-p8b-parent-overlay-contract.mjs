import fs from 'node:fs';

const parent = fs.readFileSync('src/parent-p8b.ts','utf8');
const map = fs.readFileSync('web/brick-map-p8b.ts','utf8');
const worker = fs.readFileSync('src/worker-p8b.ts','utf8');
const state = fs.readFileSync('src/phase7-state-v2.ts','utf8');

function must(condition, message){ if(!condition) throw new Error(message); }

for(const token of ['Explain This Location','p8bLoadExplain','GNSS','Atlas:','Cell','Motion:','Trust/conflicts:','Missing evidence:']) {
  must(parent.includes(token), `Explain This Location missing ${token}`);
}
must(parent.includes("/parent/api/device/'+encodeURIComponent(currentDevice)+'/state"), 'Explain panel must read current parent state endpoint');
must(!parent.includes('trustPercent') && !parent.includes('confidencePercent'), 'Explain UI must not invent trust percentages');
must(state.includes('healthPresentation') && state.includes('providers'), 'state response must carry provider truth for Explain UI');

for(const token of ['Recenter','Follow: ON','dragstart','zoomstart','p8bSetFollow(false)']) must(parent.includes(token), `follow/recenter contract missing ${token}`);
for(const token of ['oneMapStyle("detailed")','setBrickMapMode','"clean"','switchToPrivateFallback']) must(map.includes(token), `map style/fallback contract missing ${token}`);
must(map.includes('REVERSE_MIN_INTERVAL_MS = 15_000') && map.includes('reverseGeneration'), 'reverse-geocode coalescing/stale guard missing');

for(const token of ['Start Live Track','Save Wi-Fi schedule','Screen time today','Recent commutes','Create fallback PIN','Confirm claimed phone']) must(parent.includes(token), `parent control missing ${token}`);
must(worker.includes('parentP8BHtml'), 'production Worker does not render P8B parent overlay');

console.log('P8B parent overlay contract PASS');
