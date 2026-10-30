import { parentV5Html } from "./parent-v5";

function replaceOnce(input: string, needle: string, replacement: string) {
  if (!input.includes(needle)) throw new Error(`Phase 5B dashboard patch target missing: ${needle.slice(0, 80)}`);
  return input.replace(needle, replacement);
}

export function parentV5BHtml() {
  let html = parentV5Html();

  html = replaceOnce(
    html,
    '<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.css">',
    '<link rel="stylesheet" href="/maplibre-gl.css">'
  );

  html = replaceOnce(
    html,
    '<div class="shell"><main class="mapWrap"><div id="map"></div><div class="mapCard"><b id="mapName">No device</b><div id="mapPlace" class="mapMeta">Current place —</div><div id="mapDetail" class="mapMeta">Waiting for position</div></div></main>',
    '<div class="shell"><main class="mapWrap"><div id="map"></div><div class="mapCard"><b id="mapName">No device</b><div id="mapPlace" class="mapMeta">Current place —</div><div id="mapDetail" class="mapMeta">Waiting for position</div><div id="mapPrivacy" class="mapMeta">Map · checking private archive</div></div></main>'
  );

  html = replaceOnce(
    html,
    "import maplibregl from 'https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs';",
    "import { maplibregl, createBrickMap, resolveBrickPlace, getPrivateMapStatus } from '/brick-map.mjs';"
  );

  html = replaceOnce(
    html,
    "const $=s=>document.querySelector(s);const map=new maplibregl.Map({container:'map',style:'https://demotiles.maplibre.org/style.json',center:[103.8198,1.3521],zoom:11});",
    "const $=s=>document.querySelector(s);const map=createBrickMap('map');let privateMapInstalled=false,localMapPlace='Private map loading',localMapResolveKey='';"
  );

  html = replaceOnce(
    html,
    "function currentPlace(l){if(!l||l.lat==null)return '—';let best=null;for(const p of places){if(!p.enabled)continue;const d=distanceM(l.lat,l.lon,p.latitude,p.longitude);if(d<=p.radius_m&&(!best||d<best.d))best={name:p.name,d}}return best?best.name:'Outside saved places'}",
    "function schedulePrivatePlace(l){if(!privateMapInstalled||!l||l.lat==null||l.lon==null)return;const key=Math.round(l.lat*10000)+':'+Math.round(l.lon*10000);if(key===localMapResolveKey)return;localMapResolveKey=key;localMapPlace='Resolving local map context';Promise.resolve(resolveBrickPlace(l.lon,l.lat)).then(name=>{if(key!==localMapResolveKey)return;localMapPlace=name||'No local place match';text('#mapPlace','Current place · '+currentPlace(l))}).catch(()=>{if(key!==localMapResolveKey)return;localMapPlace='Local place lookup unavailable';text('#mapPlace','Current place · '+currentPlace(l))})}function currentPlace(l){if(!l||l.lat==null)return '—';let best=null;for(const p of places){if(!p.enabled)continue;const d=distanceM(l.lat,l.lon,p.latitude,p.longitude);if(d<=p.radius_m&&(!best||d<best.d))best={name:p.name,d}}if(best)return best.name;if(!privateMapInstalled)return 'Private basemap not installed';schedulePrivatePlace(l);return localMapPlace||'No local place match'}"
  );

  html = replaceOnce(
    html,
    "const today=new Date(),iso=d=>{const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,10)};$('#fromDate').value=iso(today);$('#toDate').value=iso(today);map.on('load',loadDevices);setInterval(()=>{if(snapshot)renderSnapshot(snapshot)},5000);",
    "const today=new Date(),iso=d=>{const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,10)};$('#fromDate').value=iso(today);$('#toDate').value=iso(today);map.on('load',async()=>{try{const s=await getPrivateMapStatus();privateMapInstalled=Boolean(s.installed);localMapPlace=privateMapInstalled?'Resolving local map context':'Private basemap not installed';text('#mapPrivacy',privateMapInstalled?'Map · private OSM archive':'Map · private archive missing')}catch{privateMapInstalled=false;localMapPlace='Private basemap unavailable';text('#mapPrivacy','Map · private archive unavailable')}await loadDevices()});setInterval(()=>{if(snapshot)renderSnapshot(snapshot)},5000);"
  );

  return html;
}
