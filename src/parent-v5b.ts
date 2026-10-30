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
    '<div id="healthChecks" class="card"></div><div class="sectionTitle"><h3>30-day reliability</h3></div>',
    '<div id="healthChecks" class="card"></div><div class="sectionTitle" style="margin-top:16px"><h3>App release</h3></div><div class="card"><div class="row"><span>Installed app</span><b id="installedVersion">—</b></div><div class="row"><span>Current release</span><b id="currentRelease">—</b></div><div class="row"><span>Update state</span><b id="releaseState">Unknown</b></div></div><div class="sectionTitle" style="margin-top:16px"><h3>Crash diagnostics</h3></div><div id="crashes"><div class="small">No crash data loaded.</div></div><div class="sectionTitle"><h3>30-day reliability</h3></div>'
  );

  html = replaceOnce(
    html,
    '<div id="incidents"></div><div class="sectionTitle" style="margin-top:16px"><h3>Data retention</h3></div>',
    '<div id="incidents"></div><div class="sectionTitle" style="margin-top:16px"><h3>Admin audit</h3></div><div id="auditEvents"><div class="small">No audit data loaded.</div></div><div class="sectionTitle" style="margin-top:16px"><h3>Data retention</h3></div>'
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
    "async function selectDevice(id){currentDevice=id;text('#deviceName',$('#devices').selectedOptions[0]?.textContent||'Device');text('#mapName',$('#devices').selectedOptions[0]?.textContent||'Device');connect(id);await Promise.all([loadEvents(),loadPlaces(),loadTrips(),loadHealthOps(),loadRetention()])}",
    "async function selectDevice(id){currentDevice=id;text('#deviceName',$('#devices').selectedOptions[0]?.textContent||'Device');text('#mapName',$('#devices').selectedOptions[0]?.textContent||'Device');connect(id);await Promise.all([loadEvents(),loadPlaces(),loadTrips(),loadHealthOps(),loadPhase5C(),loadRetention()])}"
  );

  html = replaceOnce(
    html,
    "if(b.dataset.tab==='health')loadHealthOps()",
    "if(b.dataset.tab==='health')Promise.all([loadHealthOps(),loadPhase5C()])"
  );

  html = replaceOnce(
    html,
    "}renderHealthChecks()}$('#refreshHealth').onclick=loadHealthOps;\nasync function loadRetention()",
    `}renderHealthChecks()}$('#refreshHealth').onclick=()=>Promise.all([loadHealthOps(),loadPhase5C()]);
function releaseCompare(installed,current){if(!installed||!current||installed==='unknown'||current==='unknown')return null;if(installed===current)return 0;const p=v=>{const m=String(v).match(/\\d+(?:\\.\\d+)+/);return m?m[0].split('.').map(Number):null},a=p(installed),b=p(current);if(!a||!b)return null;for(let i=0;i<Math.max(a.length,b.length);i++){const x=a[i]||0,y=b[i]||0;if(x<y)return-1;if(x>y)return 1}return null}
async function loadPhase5C(){if(!currentDevice)return;const installed=snapshot?.health?.appVersion||'unknown';text('#installedVersion',installed);try{const [release,crash,audit]=await Promise.all([api('/parent/api/release'),api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/crashes?limit=20'),api('/parent/api/audit?limit=20')]);const current=release.currentRelease||'unknown';text('#currentRelease',current);const cmp=releaseCompare(installed,current),state=cmp===0?'Updated':cmp===-1?'Update available':cmp===1?'App ahead of release':installed==='unknown'?'Waiting for app health':'Version mismatch';text('#releaseState',state);const cr=$('#crashes');cr.replaceChildren();for(const c of crash.crashes||[]){const d=document.createElement('div');d.className='event';const title=document.createElement('strong');title.textContent=c.module+' · '+String(c.exception_signature).slice(0,12);const meta=document.createElement('div');meta.className='small';meta.textContent=localDate(c.received_at)+' · app '+c.app_version;d.append(title,meta);cr.appendChild(d)}if(!cr.children.length){const n=document.createElement('div');n.className='small';n.textContent='No crash reports recorded.';cr.appendChild(n)}const ar=$('#auditEvents');ar.replaceChildren();for(const a of audit.audit||[]){const d=document.createElement('div');d.className='event';const title=document.createElement('strong');title.textContent=String(a.event_type).replaceAll('_',' ');const meta=document.createElement('div');meta.className='small';meta.textContent=localDate(a.created_at)+' · '+a.method+' '+a.path+' · '+a.status;d.append(title,meta);ar.appendChild(d)}if(!ar.children.length){const n=document.createElement('div');n.className='small';n.textContent='No administrative changes recorded yet.';ar.appendChild(n)}}catch(e){text('#releaseState','Unavailable');const cr=$('#crashes');if(cr)cr.textContent='Crash diagnostics unavailable';const ar=$('#auditEvents');if(ar)ar.textContent='Audit history unavailable'}}
async function loadRetention()`
  );

  html = replaceOnce(
    html,
    "const today=new Date(),iso=d=>{const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,10)};$('#fromDate').value=iso(today);$('#toDate').value=iso(today);map.on('load',loadDevices);setInterval(()=>{if(snapshot)renderSnapshot(snapshot)},5000);",
    "const today=new Date(),iso=d=>{const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,10)};$('#fromDate').value=iso(today);$('#toDate').value=iso(today);map.on('load',async()=>{try{const s=await getPrivateMapStatus();privateMapInstalled=Boolean(s.installed);localMapPlace=privateMapInstalled?'Resolving local map context':'Private basemap not installed';text('#mapPrivacy',privateMapInstalled?'Map · private OSM archive':'Map · private archive missing')}catch{privateMapInstalled=false;localMapPlace='Private basemap unavailable';text('#mapPrivacy','Map · private archive unavailable')}await loadDevices()});setInterval(()=>{if(snapshot)renderSnapshot(snapshot)},5000);"
  );

  return html;
}
