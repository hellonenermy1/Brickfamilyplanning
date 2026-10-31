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
    '</style></head>',
    `.markerPopup{font:12px/1.45 Inter,system-ui,sans-serif;min-width:170px}.markerPopup b{font-size:13px}.markerPopup div{margin-top:2px;color:#475467}
@media(max-width:900px){.side{position:relative;z-index:20;margin-top:-18px;border-radius:18px 18px 0 0;box-shadow:0 -8px 28px #0002}.bottomLabel{cursor:pointer;user-select:none;font-weight:800;padding:10px}.side.collapsed .quick,.side.collapsed .tabs,.side.collapsed .content{display:none}.side.collapsed .bottomLabel{padding:14px}.mapWrap{height:58vh}}
</style></head>`
  );

  html = replaceOnce(
    html,
    '<div class="shell"><main class="mapWrap"><div id="map"></div><div class="mapCard"><b id="mapName">No device</b><div id="mapPlace" class="mapMeta">Current place —</div><div id="mapDetail" class="mapMeta">Waiting for position</div></div></main>',
    '<div class="shell"><main class="mapWrap"><div id="map"></div><div class="mapCard"><b id="mapName">No device</b><div id="mapPlace" class="mapMeta">Current place —</div><div id="mapDetail" class="mapMeta">Waiting for position</div><div id="mapPrivacy" class="mapMeta">Map · checking private archive</div></div></main>'
  );

  html = replaceOnce(
    html,
    '<div id="healthChecks" class="card"></div><div class="sectionTitle"><h3>30-day reliability</h3></div>',
    '<div id="healthChecks" class="card"></div><div class="sectionTitle" style="margin-top:16px"><h3>App release</h3></div><div class="card"><div class="row"><span>Installed app</span><b id="installedVersion">—</b></div><div class="row"><span>Current release</span><b id="currentRelease">—</b></div><div class="row"><span>Update state</span><b id="releaseState">Unknown</b></div><div class="row"><span>Local journal</span><b id="journalState">—</b></div></div><div class="sectionTitle" style="margin-top:16px"><h3>Crash diagnostics</h3></div><div id="crashes"><div class="small">No crash data loaded.</div></div><div class="sectionTitle"><h3>30-day reliability</h3></div>'
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
    "let marker=null,playMarker=null,ws=null,currentDevice='',snapshot=null,historyPoints=[],displayPoints=[],playTimer=null,playIndex=0,places=[],lastMarkerPoint=null,animationId=0;",
    "let marker=null,markerPopup=null,playMarker=null,ws=null,currentDevice='',snapshot=null,historyPoints=[],displayPoints=[],playTimer=null,playIndex=0,places=[],lastMarkerPoint=null,animationId=0;"
  );

  html = replaceOnce(
    html,
    "function animateMarker(target){if(!marker){marker=new maplibregl.Marker({scale:.85}).setLngLat(target).addTo(map);lastMarkerPoint=target;map.easeTo({center:target,zoom:16,duration:700});return}const start=lastMarkerPoint||target;lastMarkerPoint=target;const begun=performance.now();cancelAnimationFrame(animationId);const duration=900;const tick=now=>{const t=Math.min(1,(now-begun)/duration),e=1-Math.pow(1-t,3);marker.setLngLat([start[0]+(target[0]-start[0])*e,start[1]+(target[1]-start[1])*e]);if(t<1)animationId=requestAnimationFrame(tick)};animationId=requestAnimationFrame(tick)}",
    "function markerPopupNode(l){const root=document.createElement('div');root.className='markerPopup';const name=document.createElement('b');name.textContent=$('#devices').selectedOptions[0]?.textContent||'Device';const mode=document.createElement('div');mode.textContent='Mode · '+(l.activity||'unknown')+(Number.isFinite(l.activityConfidence)?' · '+Math.round(l.activityConfidence)+'%':'');const speed=document.createElement('div');speed.textContent='Speed · '+(l.speedKph==null?'—':l.speedKph.toFixed(l.speedKph<10?1:0)+' km/h'+(l.speedAccuracyKph==null?'':' ±'+l.speedAccuracyKph.toFixed(1)));const accuracy=document.createElement('div');accuracy.textContent='Accuracy · '+(l.uncertaintyM==null?'—':'±'+Math.round(l.uncertaintyM)+' m');const updated=document.createElement('div');updated.textContent='Updated · '+fmtAge(Math.max(0,Date.now()-l.receivedAt))+' ago';root.append(name,mode,speed,accuracy,updated);return root}function updateMarkerPopup(l){if(!marker||!l)return;if(!markerPopup){markerPopup=new maplibregl.Popup({offset:18,closeButton:false});marker.setPopup(markerPopup)}markerPopup.setDOMContent(markerPopupNode(l))}function animateMarker(target){if(!marker){marker=new maplibregl.Marker({scale:.85}).setLngLat(target).addTo(map);lastMarkerPoint=target;map.easeTo({center:target,zoom:16,duration:700});return}const start=lastMarkerPoint||target;lastMarkerPoint=target;const begun=performance.now();cancelAnimationFrame(animationId);const duration=900;const tick=now=>{const t=Math.min(1,(now-begun)/duration),e=1-Math.pow(1-t,3);marker.setLngLat([start[0]+(target[0]-start[0])*e,start[1]+(target[1]-start[1])*e]);if(t<1)animationId=requestAnimationFrame(tick)};animationId=requestAnimationFrame(tick)}"
  );

  html = replaceOnce(
    html,
    "function currentPlace(l){if(!l||l.lat==null)return '—';let best=null;for(const p of places){if(!p.enabled)continue;const d=distanceM(l.lat,l.lon,p.latitude,p.longitude);if(d<=p.radius_m&&(!best||d<best.d))best={name:p.name,d}}return best?best.name:'Outside saved places'}",
    "function schedulePrivatePlace(l){if(!privateMapInstalled||!l||l.lat==null||l.lon==null)return;const key=Math.round(l.lat*10000)+':'+Math.round(l.lon*10000);if(key===localMapResolveKey)return;localMapResolveKey=key;localMapPlace='Resolving local map context';Promise.resolve(resolveBrickPlace(l.lon,l.lat)).then(name=>{if(key!==localMapResolveKey)return;localMapPlace=name||'No local place match';text('#mapPlace','Current place · '+currentPlace(l))}).catch(()=>{if(key!==localMapResolveKey)return;localMapPlace='Local place lookup unavailable';text('#mapPlace','Current place · '+currentPlace(l))})}function currentPlace(l){if(!l||l.lat==null)return '—';let best=null;for(const p of places){if(!p.enabled)continue;const d=distanceM(l.lat,l.lon,p.latitude,p.longitude);if(d<=p.radius_m&&(!best||d<best.d))best={name:p.name,d}}if(best)return best.name;if(!privateMapInstalled)return 'Private basemap not installed';schedulePrivatePlace(l);return localMapPlace||'No local place match'}"
  );

  html = replaceOnce(
    html,
    "function renderSnapshot(x){if(!x)return;snapshot=x;const l=x.latest,h=x.health,d=x.derived||{};setStatus($('#deviceStatus'),'DEVICE',d.deviceStatus);setStatus($('#positionStatus'),'POSITION',d.positionStatus);text('#deviceName',$('#devices').selectedOptions[0]?.textContent||'Device');text('#mapName',$('#devices').selectedOptions[0]?.textContent||'Device');text('#updatedHeader',l?'Updated '+fmtAge(Date.now()-l.receivedAt)+' ago':'Updated —');if(l){text('#accuracy',l.uncertaintyM==null?'—':'±'+Math.round(l.uncertaintyM)+' m');text('#speed',l.speedKph==null?'—':l.speedKph.toFixed(l.speedKph<10?1:0)+' km/h');text('#movement',l.activity||'—');text('#battery',l.batteryPct+'%'+(l.charging?' · charging':''));text('#quality',(l.quality||'—')+(l.fallback?' · estimated':''));text('#mapPlace','Current place · '+currentPlace(l));text('#mapDetail',(l.activity||'unknown')+' · '+(l.speedKph==null?'speed —':l.speedKph.toFixed(1)+' km/h')+' · '+(l.uncertaintyM==null?'accuracy —':'±'+Math.round(l.uncertaintyM)+' m'));if(l.lat!=null&&l.lon!=null){animateMarker([l.lon,l.lat]);updateAccuracy(l)}}if(h)text('#network',h.network||'—');renderHealthChecks();renderLiveNotice()}",
    "function renderSnapshot(x){if(!x)return;snapshot=x;const l=x.latest,h=x.health,d=x.derived||{};setStatus($('#deviceStatus'),'DEVICE',d.deviceStatus);setStatus($('#positionStatus'),'POSITION',d.positionStatus);text('#deviceName',$('#devices').selectedOptions[0]?.textContent||'Device');text('#mapName',$('#devices').selectedOptions[0]?.textContent||'Device');text('#updatedHeader',l?'Updated '+fmtAge(Date.now()-l.receivedAt)+' ago':'Updated —');if(l){text('#accuracy',l.uncertaintyM==null?'—':'±'+Math.round(l.uncertaintyM)+' m');const speed=l.speedKph==null?'—':l.speedKph.toFixed(l.speedKph<10?1:0)+' km/h'+(l.speedAccuracyKph==null?'':' ±'+l.speedAccuracyKph.toFixed(1));text('#speed',speed);text('#movement',(l.activity||'—')+(Number.isFinite(l.activityConfidence)?' · '+Math.round(l.activityConfidence)+'%':''));text('#battery',l.batteryPct+'%'+(l.charging?' · charging':''));text('#quality',(l.quality||'—')+(l.fallback?' · estimated':''));text('#mapPlace','Current place · '+currentPlace(l));text('#mapDetail',(l.activity||'unknown')+' · '+(l.speedKph==null?'speed —':l.speedKph.toFixed(1)+' km/h'+(l.speedAccuracyKph==null?'':' ±'+l.speedAccuracyKph.toFixed(1)))+' · '+(l.uncertaintyM==null?'accuracy —':'±'+Math.round(l.uncertaintyM)+' m'));if(l.lat!=null&&l.lon!=null){animateMarker([l.lon,l.lat]);updateMarkerPopup(l);updateAccuracy(l)}}if(h)text('#network',h.network||'—');renderHealthChecks();renderLiveNotice()}"
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
async function loadPhase5C(){if(!currentDevice)return;const installed=snapshot?.health?.appVersion||'unknown';text('#installedVersion',installed);const journal=snapshot?.health?.journalWriteHealthy;text('#journalState',journal===false?'WRITE FAILED':journal===true?'Healthy':'Waiting for app health');try{const [release,crash,audit]=await Promise.all([api('/parent/api/release'),api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/crashes?limit=20'),api('/parent/api/audit?limit=20')]);const current=release.currentRelease||'unknown';text('#currentRelease',current);const cmp=releaseCompare(installed,current),state=cmp===0?'Updated':cmp===-1?'Update available':cmp===1?'App ahead of release':installed==='unknown'?'Waiting for app health':'Version mismatch';text('#releaseState',state);const cr=$('#crashes');cr.replaceChildren();for(const c of crash.crashes||[]){const d=document.createElement('div');d.className='event';const title=document.createElement('strong');title.textContent=c.module+' · '+String(c.exception_signature).slice(0,12);const meta=document.createElement('div');meta.className='small';meta.textContent=localDate(c.received_at)+' · app '+c.app_version;d.append(title,meta);cr.appendChild(d)}if(!cr.children.length){const n=document.createElement('div');n.className='small';n.textContent='No crash reports recorded.';cr.appendChild(n)}const ar=$('#auditEvents');ar.replaceChildren();for(const a of audit.audit||[]){const d=document.createElement('div');d.className='event';const title=document.createElement('strong');title.textContent=String(a.event_type).replaceAll('_',' ');const meta=document.createElement('div');meta.className='small';meta.textContent=localDate(a.created_at)+' · '+a.method+' '+a.path+' · '+a.status;d.append(title,meta);ar.appendChild(d)}if(!ar.children.length){const n=document.createElement('div');n.className='small';n.textContent='No administrative changes recorded yet.';ar.appendChild(n)}}catch(e){text('#releaseState','Unavailable');const cr=$('#crashes');if(cr)cr.textContent='Crash diagnostics unavailable';const ar=$('#auditEvents');if(ar)ar.textContent='Audit history unavailable'}}
async function loadRetention()`
  );

  html = replaceOnce(
    html,
    "const today=new Date(),iso=d=>{const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,10)};$('#fromDate').value=iso(today);$('#toDate').value=iso(today);map.on('load',loadDevices);setInterval(()=>{if(snapshot)renderSnapshot(snapshot)},5000);",
    "const today=new Date(),iso=d=>{const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,10)};$('#fromDate').value=iso(today);$('#toDate').value=iso(today);const side=$('.side'),sheetLabel=$('.bottomLabel');if(matchMedia('(max-width:900px)').matches&&side)side.classList.add('collapsed');if(sheetLabel&&side)sheetLabel.onclick=()=>{side.classList.toggle('collapsed');sheetLabel.textContent=side.classList.contains('collapsed')?'BRICK DETAILS · TAP TO OPEN':'BRICK DETAILS · TAP TO COLLAPSE'};map.on('load',async()=>{try{const s=await getPrivateMapStatus();privateMapInstalled=Boolean(s.installed);localMapPlace=privateMapInstalled?'Resolving local map context':'Private basemap not installed';text('#mapPrivacy',privateMapInstalled?'Map · private OSM archive':'Map · private archive missing')}catch{privateMapInstalled=false;localMapPlace='Private basemap unavailable';text('#mapPrivacy','Map · private archive unavailable')}await loadDevices()});setInterval(()=>{if(snapshot)renderSnapshot(snapshot)},5000);"
  );

  return html;
}
