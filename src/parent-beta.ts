/** Adds a test drawer and selected-device socket receipt without replacing existing portal features. */
export function parentBetaHtml(base:string){
 const needle='const today=new Date(),iso=d=>';
 if(!base.includes(needle)||!base.includes('<body'))throw Error('beta_parent_hook_missing');
 const panel=`<details id="brickBeta" style="position:fixed;right:12px;bottom:12px;z-index:500;background:#fff;color:#18362d;border:2px solid #26755c;border-radius:12px;box-shadow:0 5px 25px #0003;max-width:calc(100vw - 24px);width:420px;padding:12px"><summary style="cursor:pointer;font-weight:800">BETA · Test centre</summary><div style="max-height:65vh;overflow:auto"><p>Controlled beta. The 72-hour run needs review; elapsed time alone never means a pass.</p><p id="betaRelease"><a href="/parent/beta/download/manifest">APK release status</a></p><button type="button" id="betaRefresh">Refresh selected phone</button><p id="betaHeadline" role="status">Select a phone to view its test evidence.</p><div id="betaChecks"></div><p id="betaRun"></p><p>Phone stop state and manual interventions are available in its private export. Import it here after stopping the run; imports remain labelled as parent-provided evidence.</p><label>Import phone evidence <input id="betaImport" type="file" accept="application/json,.json"></label><details><summary>Detailed evidence</summary><pre id="betaEvidence" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></details></div></details>`;
 let html=base.replace(/(<body[^>]*>)/,'$1'+panel);
 // Authenticated same-origin account settings; no credential leaves the browser except in the TLS POST body.
 const accountAnchor='<div class="brand">BRICK</div>';
 if(!html.includes(accountAnchor))throw Error('phase2_parent_account_header_missing');
 html=html.replace(accountAnchor,accountAnchor+'<a href="/parent/change-password" style="font-size:12px;color:#174672;text-decoration:underline;white-space:nowrap">Change login</a>');
 // Beta only: keep the tracking map compact while allowing the controls to scroll normally.
 // Taller beta map requested by tester: ~2x previous desktop height; preserve independent right-hand controls.
 const compactMapCss=`<style id="brickBetaCompactMap">
 @media(min-width:901px){
 .shell{height:auto;min-height:calc(100vh - 64px);align-items:start}
 .mapWrap{height:clamp(560px,92vh,1000px);position:sticky;top:64px}
 .side{min-height:calc(100vh - 64px)}
 .content{overflow:visible}
 }
 @media(max-width:900px){
 .shell{height:auto;min-height:0}
 .mapWrap{height:clamp(360px,70vh,700px);min-height:360px;position:relative;top:auto}
 .side{min-height:0}
 }
 </style>`;
 if(!html.includes('</head>'))throw Error('beta_parent_head_missing');
 html=html.replace('</head>',compactMapCss+'</head>');
 // The old immutable URL can leave a previous map bundle cached for a year.
 // Keep the original four-export contract while loading the currently built module.
 const mapImport="import { maplibregl, createBrickMap, resolveBrickPlace, getPrivateMapStatus } from '/brick-map.mjs';";
 if(!html.includes(mapImport))throw Error('beta_parent_map_import_missing');
 html=html.replace(mapImport,"import { maplibregl, createBrickMap, resolveBrickPlace, getPrivateMapStatus } from '/brick-map.mjs?v=beta-parent-recovery-20261105';");
 // Phase 2: read-only Logs tab backed by existing signed beta observation records.
// Never describe it as a complete Android DiagnosticStore stream until that protocol exists.
 const healthTab='<button data-tab="health">Health</button>';
 const healthPane='<section id="health" class="pane">';
 if(!html.includes(healthTab)||!html.includes(healthPane))throw Error('phase2_logs_markup_anchor_missing');
 html=html.replace(healthTab,healthTab+'<button data-tab="logs">Logs</button>');
 html=html.replace(healthPane,'<section id="logs" class="pane"><div class="sectionTitle"><h3>Phone & cloud observation logs</h3><button id="refreshLogs" type="button">Refresh</button></div><div class="notice">Available: signed beta health observations within the last seven Singapore calendar days. Full Android diagnostic logs are not yet uploaded; absence of observations does not mean the phone is healthy.</div><div id="phase2LogsStatus" class="small">Select a phone to load observations.</div><div id="phase2LogsList"></div></section>'+healthPane);
 // Read-only tracking diagnosis from signed phone health and server receipt times.
 html=html.replace(healthPane,healthPane+'<div class="card" style="margin-bottom:12px"><div class="sectionTitle"><h3>Tracking delivery diagnosis</h3></div><div id="p2TrackingDiagnosis" role="status" class="notice">Waiting for the selected phone\'s signed tracking evidence.</div><p id="p2TrackingEvidence" class="small">No current capture or server receipt has been verified.</p></div>');
// Beta-only protections: reject delayed data from a previously selected phone.
 const p2GuardSwap=(original:string,replacement:string)=>{
  if(!html.includes(original)||html.split(original).length!==2)throw Error('phase2_device_race_hook_missing_'+original.slice(0,44));
  html=html.replace(original,replacement);
 };
 p2GuardSwap("async function loadPlaces(){if(!currentDevice)return;const j=await api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/geofences');places=j.geofences||[];","async function loadPlaces(){const requestDevice=currentDevice;if(!requestDevice)return;const j=await api('/parent/api/device/'+encodeURIComponent(requestDevice)+'/geofences');if(requestDevice!==currentDevice)return;places=j.geofences||[];");
 p2GuardSwap("async function loadTrips(){if(!currentDevice)return;const j=await api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/trips'),r=$('#tripsList');","async function loadTrips(){const requestDevice=currentDevice;if(!requestDevice)return;const j=await api('/parent/api/device/'+encodeURIComponent(requestDevice)+'/trips');if(requestDevice!==currentDevice)return;const r=$('#tripsList');");
 p2GuardSwap("async function loadHealthOps(){if(!currentDevice)return;try{const [rel,inc]=await Promise.all([api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/reliability?days=30'),api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/health/incidents?limit=100')]);","async function loadHealthOps(){const requestDevice=currentDevice;if(!requestDevice)return;try{const [rel,inc]=await Promise.all([api('/parent/api/device/'+encodeURIComponent(requestDevice)+'/reliability?days=30'),api('/parent/api/device/'+encodeURIComponent(requestDevice)+'/health/incidents?limit=100')]);if(requestDevice!==currentDevice)return;");
 p2GuardSwap("catch(e){text('#relNote',e.message)}renderHealthChecks()}","catch(e){if(requestDevice===currentDevice)text('#relNote',e.message)}if(requestDevice===currentDevice)renderHealthChecks()}");
 p2GuardSwap("async function loadRetention(){if(!currentDevice)return;try{const j=await api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/retention');$('#retentionDays').value=j.safetyEventDays||180","async function loadRetention(){const requestDevice=currentDevice;if(!requestDevice)return;try{const j=await api('/parent/api/device/'+encodeURIComponent(requestDevice)+'/retention');if(requestDevice!==currentDevice)return;$('#retentionDays').value=j.safetyEventDays||180");
 p2GuardSwap("async function loadPhase5C(){if(!currentDevice)return;const installed=","async function loadPhase5C(){const requestDevice=currentDevice;if(!requestDevice)return;const installed=");
 p2GuardSwap("api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/crashes?limit=20'),api('/parent/api/audit?limit=20')]);const current=release.currentRelease","api('/parent/api/device/'+encodeURIComponent(requestDevice)+'/crashes?limit=20'),api('/parent/api/audit?limit=20')]);if(requestDevice!==currentDevice)return;const current=release.currentRelease");
// Finish Phase 2 per-phone async privacy boundary for safety controls and data.
 p2GuardSwap("if(revoked){try{renderSnapshot(await api('/parent/api/device/'+encodeURIComponent(id)+'/state'))}catch{snapshot=null;renderHealthChecks()}}","if(revoked){try{const revokedState=await api('/parent/api/device/'+encodeURIComponent(id)+'/state');if(currentDevice===id)renderSnapshot(revokedState)}catch{if(currentDevice===id){snapshot=null;renderHealthChecks()}}}");
 p2GuardSwap("async function loadEvents(){if(!currentDevice)return;const j=await api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/events?limit=40'),root=$('#events');","async function loadEvents(){const requestDevice=currentDevice;if(!requestDevice)return;const j=await api('/parent/api/device/'+encodeURIComponent(requestDevice)+'/events?limit=40');if(requestDevice!==currentDevice)return;const root=$('#events');");
 p2GuardSwap("d.onclick=()=>map.easeTo({center:[e.longitude,e.latitude],zoom:17,duration:700})","d.onclick=()=>{if(requestDevice===currentDevice)map.easeTo({center:[e.longitude,e.latitude],zoom:17,duration:700})}");
 p2GuardSwap("async function loadBatteryTrend(){if(!currentDevice)return;try{const b=await api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/battery-drain');const rate=","async function loadBatteryTrend(){const requestDevice=currentDevice;if(!requestDevice)return;try{const b=await api('/parent/api/device/'+encodeURIComponent(requestDevice)+'/battery-drain');if(requestDevice!==currentDevice)return;const rate=");
 p2GuardSwap("catch{text('#batteryTrend','Unavailable')}};function setGpsButtons","catch{if(requestDevice===currentDevice)text('#batteryTrend','Unavailable')}};function setGpsButtons");
 p2GuardSwap("async function loadLocationControl(){if(!currentDevice)return;try{const s=await api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/location-control');text('#gpsDesired',","async function loadLocationControl(){const requestDevice=currentDevice;if(!requestDevice)return;try{const s=await api('/parent/api/device/'+encodeURIComponent(requestDevice)+'/location-control');if(requestDevice!==currentDevice)return;text('#gpsDesired',");
 p2GuardSwap("catch(e){text('#gpsControlStatus','GPS status unavailable');setGpsButtons(false)}}","catch(e){if(requestDevice!==currentDevice)return;text('#gpsControlStatus','GPS status unavailable');setGpsButtons(false)}}");
 p2GuardSwap("toggle.onclick=async()=>{await api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/geofences/'+encodeURIComponent(g.id)","toggle.onclick=async()=>{if(requestDevice!==currentDevice)return;await api('/parent/api/device/'+encodeURIComponent(requestDevice)+'/geofences/'+encodeURIComponent(g.id)");
 p2GuardSwap("del.onclick=async()=>{if(confirm('Delete '+g.name+'?')){await api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/geofences/'+encodeURIComponent(g.id)","del.onclick=async()=>{if(requestDevice!==currentDevice)return;if(confirm('Delete '+g.name+'?')){if(requestDevice!==currentDevice)return;await api('/parent/api/device/'+encodeURIComponent(requestDevice)+'/geofences/'+encodeURIComponent(g.id)");
 p2GuardSwap("btn.onclick=async()=>{await api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/trips/'+encodeURIComponent(t.id)+'/end'","btn.onclick=async()=>{if(requestDevice!==currentDevice)return;await api('/parent/api/device/'+encodeURIComponent(requestDevice)+'/trips/'+encodeURIComponent(t.id)+'/end'");
const js=String.raw`

// Browser-side fail-closed presentation clamp. A previously delivered "fresh"
// server snapshot cannot remain fresh forever after the phone or socket stops.
// Never promote an old/stale server reading to fresh; this affects display only.
function p2ClampSnapshot(x,now){
 if(!x||typeof x!=='object')return x;
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 const age=n=>finite(n)&&n>0&&n<=now+120000?Math.max(0,now-n):null;
 const d={...(x.derived||{})},p=x.latest||{},h=x.health||{};
 const ages=[age(p.wallTimeMs),age(p.receivedAt)].filter(v=>v!==null);
 const positionAge=ages.length?Math.max(...ages):null;
 const invalidFuture=(finite(p.wallTimeMs)&&p.wallTimeMs>now+120000)||(finite(p.receivedAt)&&p.receivedAt>now+120000);
 const interval=Math.max(1000,Math.min(300000,finite(h.trackingIntervalMs)?h.trackingIntervalMs:5000));
 const staleAt=Math.max(60000,interval*3+30000);
 const freshAt=Math.max(15000,Math.min(staleAt/2,interval*1.5+5000));
 if(d.positionStatus==='fresh'&&(invalidFuture||positionAge===null||positionAge>freshAt)){
  d.positionStatus=positionAge===null&&!invalidFuture?'unavailable':'stale';
 }
 const healthAge=age(h.receivedAt);
 if(healthAge!==null&&healthAge>75000)d.deviceStatus='offline';
 if(d.deviceStatus==='offline'&&d.positionStatus==='fresh')d.positionStatus='stale';
 return {...x,derived:d};
}

// Infer only which tracking stage lacks evidence; this is not a claim that the
// phone is safe, continuously tracked or that a pending event reached the parent.
function p2TrackingDiagnosis(x,now){
 const h=x?.health||{},latest=x?.latest||{},d=x?.derived||{};
 const age=value=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=now+120000?Math.max(0,now-value):null;
 const healthAge=age(h.receivedAt),captureAge=age(latest.wallTimeMs),receiptAge=age(latest.receivedAt);
 const hasFix=captureAge!==null&&receiptAge!==null;
 const pending=Number.isSafeInteger(h.pendingRecords)&&h.pendingRecords>=0?h.pendingRecords:null;
 const ack=typeof h.ackAgeMs==='number'&&Number.isFinite(h.ackAgeMs)&&h.ackAgeMs>=0?h.ackAgeMs:null;
 const explain=ms=>ms===null?'not reported':Math.round(ms/1000)+'s ago';
 const evidence='Phone health '+explain(healthAge)+' · GPS capture '+explain(captureAge)+' · cloud receipt '+explain(receiptAge)+' · pending records '+(pending===null?'not reported':pending)+' · last ACK age '+(ack===null?'not reported':Math.round(ack/1000)+'s');
 const result=(level,code,message)=>({level,code,message,evidence});
 if(healthAge===null)return result('unknown','no_health_receipt','No usable phone-health receipt. The browser cannot establish whether tracking is running.');
 if(healthAge>90000)return result('warn','health_heartbeat_stale','Phone health is overdue; check service, battery restrictions and network before trusting the map.');
 if(h.locationEnabled===false)return result('warn','location_disabled','The phone reports location services disabled.');
 if(h.fineLocationPermission===false)return result('warn','precise_permission_missing','The phone reports missing precise location permission.');
 if(h.locationSubscribed===false)return result('warn','location_subscription_missing','The phone reports no active location subscription.');
 if(pending!==null&&pending>0&&ack!==null&&ack>120000)return result('warn','upload_backlog','The phone reports queued records and an old server ACK. Capture may be working, but delivery needs investigation.');
 if(!hasFix)return result('unknown','no_fix_receipt','Phone health arrived, but a current GPS capture/server receipt pair is not available.');
 if(captureAge>120000)return result('warn','gps_capture_stale','The latest trusted GPS capture is old, even if its upload arrived recently.');
 if(receiptAge>90000)return result('warn','server_receipt_stale','No recent position has reached the parent cloud read model.');
 if(d.deviceStatus==='offline')return result('warn','device_offline','The server reports the phone offline; last location must be treated as historical.');
 if(d.positionStatus==='fresh'&&d.deviceStatus==='healthy')return result('info','recent_evidence','Recent phone health, capture and delivery evidence are present. This is not an endurance guarantee.');
 return result('warn','position_degraded','Recent evidence exists, but tracking is not confirmed fresh and healthy. Inspect Health and Logs.');
}
function p2DisplayTrackingDiagnosis(x,now){
 const result=p2TrackingDiagnosis(x,now);
 const el=document.getElementById('p2TrackingDiagnosis'),details=document.getElementById('p2TrackingEvidence');
 if(el){el.textContent=result.message;el.className='notice '+(result.level==='warn'?'warn':'');el.dataset.reason=result.code;}
 if(details)details.textContent=result.evidence;
}
const p2OriginalRenderSnapshot=renderSnapshot;
renderSnapshot=function(x){const now=Date.now(),safe=p2ClampSnapshot(x,now);const rendered=p2OriginalRenderSnapshot(safe);p2DisplayTrackingDiagnosis(safe,now);return rendered};

// Phase 2 portal safety: preserve every stored event but group rapid historical fall noise.
// Grouping only affects presentation, not D1 history, SOS delivery or Android's sensor policy.
const p2SeenBanners=new Map();
function p2SafetyKey(e){
 const id=e?.id??e?.eventId;
 return id==null||String(id).length===0?null:String(id);
}
function p2GroupFallEvents(events){
 const sorted=[...events].sort((a,b)=>Number(b.server_created_at||0)-Number(a.server_created_at||0));
 const groups=[];
 const identities=new Set();
 for(const e of sorted){
  const identity=p2SafetyKey(e);
  if(identity&&identities.has(identity))continue;
  if(identity)identities.add(identity);
  const when=Number(e.server_created_at)||0;
  const prior=groups[groups.length-1];
  if(e.kind==='fall_detected'&&prior?.kind==='fall_detected'&&when>0&&Math.abs(prior.oldest-when)<=60000){
   prior.records.push(e);prior.oldest=Math.min(prior.oldest,when);continue;
  }
  groups.push({kind:e.kind,records:[e],newest:when,oldest:when});
 }
 return groups;
}
const p2OriginalLabel=labelEvent;
labelEvent=function(e){return e?.kind==='fall_detected'?'Unverified phone impact (legacy fall alert)':p2OriginalLabel(e)};
loadEvents=async function(){
 const id=currentDevice;if(!id)return;
 try{
  const response=await api('/parent/api/device/'+encodeURIComponent(id)+'/events?limit=100');
  if(id!==currentDevice)return;
  const root=$('#events');root.replaceChildren();
  const groups=p2GroupFallEvents(Array.isArray(response.events)?response.events:[]);
  for(const group of groups){
   const e=group.records[0],fall=group.kind==='fall_detected';
   const d=document.createElement('div');d.className='event '+(e.kind==='sos_started'?'sos':e.kind==='battery_critical'||e.kind==='trip_alert'||e.kind==='device_offline'||e.kind==='service_unhealthy'?'warn':'');
   const title=document.createElement('strong');
   title.textContent=fall?(group.records.length>1?'Unverified phone impacts · '+group.records.length+' records':'Unverified phone impact (legacy fall alert)'):labelEvent(e);
   const meta=document.createElement('div');meta.className='small';
   const detail=(()=>{try{return JSON.parse(e.detail_json||'{}')}catch{return {}}})();
   meta.textContent=localDate(e.server_created_at)+(fall?' · Not evidence of a person falling; automatic sensor currently unreliable':(detail.reason?' · '+String(detail.reason).replaceAll('_',' '):'')+(detail.batteryPct!=null?' · battery '+detail.batteryPct+'%':'')+(e.accuracy_m!=null?' · ±'+Math.round(e.accuracy_m)+'m':''));
   d.append(title,meta);
   if(group.records.length>1){
    const more=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Show all '+group.records.length+' original event timestamps';more.append(summary);
    for(const original of group.records){const t=document.createElement('div');t.className='small';t.textContent=localDate(original.server_created_at)+' · event '+String(p2SafetyKey(original)||'ID unavailable').slice(0,12);more.append(t)}
    d.append(more);
   }
   if(!fall&&e.latitude!=null&&e.longitude!=null){d.style.cursor='pointer';d.onclick=()=>{if(map?.isStyleLoaded())map.easeTo({center:[e.longitude,e.latitude],zoom:17,duration:700})}};
   root.append(d);
  }
  if(!groups.length){const n=document.createElement('div');n.className='small';n.textContent='No safety events yet.';root.append(n)}
 }catch(error){if(id===currentDevice){const root=$('#events');root.replaceChildren();const notice=document.createElement('div');notice.className='small';notice.textContent='Safety event history unavailable: '+String(error?.message||'request failed');root.append(notice)}}
};
const p2OriginalWsMessage=wsMessage;
wsMessage=function(m){
 if(m?.type==='safety_event'&&m.event){
  const key=p2SafetyKey(m.event),now=Date.now(),existing=key==null?null:p2SeenBanners.get(currentDevice+':'+key);
  if(key&&existing&&now-existing<300000)return;
  if(key)p2SeenBanners.set(currentDevice+':'+key,now);
  for(const [seen,at] of p2SeenBanners){if(now-at>300000)p2SeenBanners.delete(seen)}
  // Don't raise unverified human-fall banners. History remains accessible.
  if(m.event.kind==='fall_detected'){loadEvents();return}
 }
 p2OriginalWsMessage(m);
};
// Phase 2 History: retain raw evidence, but never reuse another device's
// playback markers, routes, or an earlier asynchronous HTTP response.
let p2HistoryRequest=0;
function p2HistoryResponseCurrent(requestDevice,requestId,selectedDevice,activeId){
 return Boolean(requestDevice)&&requestDevice===selectedDevice&&requestId===activeId;
}
const p2OriginalDrawHistory=drawHistory;
function p2ClearHistoryView(){
 stopPlay();
 historyPoints=[];displayPoints=[];playIndex=0;
 const seek=document.getElementById('seek');
 if(seek){seek.max='0';seek.value='0';}
 text('#playTime','—');
 renderTimeline([]);
 if(playMarker){try{playMarker.remove()}catch{}playMarker=null;}
 if(map?.isStyleLoaded()&&map.getSource('historyRoute')){
  try{p2OriginalDrawHistory([])}catch{}
 }
}
const p2OriginalSelectDevice=selectDevice;
selectDevice=async function(id){
 if(id!==currentDevice){
  p2HistoryRequest++;
  p2ClearHistoryView();
  // The previously selected phone's last heartbeat/coordinates must never
  // keep rendering under the newly selected phone during network latency.
  snapshot=null;
  places=[];
  p2DisplayTrackingDiagnosis(null,Date.now());
  for(const selector of ['#events','#placesList','#tripsList','#incidents','#crashes']){
   const el=document.querySelector(selector);if(el)el.replaceChildren();
  }
  for(const selector of ['#quality','#accuracy','#speed','#network','#gpsDesired','#gpsActual','#batteryTrend','#releaseState']){
   const el=document.querySelector(selector);if(el)el.textContent='—';
  }
  text('#gpsControlStatus','Waiting for selected phone…');
  renderHealthChecks();
  text('#historyNote','Select a range to load history for this phone.');
 }
 return p2OriginalSelectDevice(id);
};
// Never draw a false straight route across missing positions or an extended gap.
// Use raw history instead of displayPoints because display simplification may
// legitimately remove NULL-coordinate evidence and conceal a recording gap.
function p2BuildHistoryGeometry(points){
 const lines=[],all=[];let segment=[],lastTime=null,gaps=0;
 const flush=()=>{if(segment.length>1)lines.push(segment);segment=[];lastTime=null};
 for(const p of Array.isArray(points)?points:[]){
  const c=p&&typeof p==='object'?historyCoord(p):null;
  const valid=Array.isArray(c)&&c.length===2&&c.every(Number.isFinite)&&Math.abs(c[0])<=180&&Math.abs(c[1])<=90;
  const time=Number.isSafeInteger(p?.wallTimeMs)?p.wallTimeMs:null;
  if(!valid||time===null){if(segment.length){flush();gaps++}continue}
  if(lastTime!==null&&(time<lastTime||time-lastTime>300000)){flush();gaps++}
  segment.push(c);all.push(c);lastTime=time;
 }
 flush();
 return {data:{type:'Feature',geometry:{type:'MultiLineString',coordinates:lines},properties:{}},all,gaps,segments:lines.length};
}
let p2HistoryRouteStats={gaps:0,segments:0};
function p2DrawHistoryGeometry(parts){
 const src=map.getSource('historyRoute');
 if(src)src.setData(parts.data);
 else{
  map.addSource('historyRoute',{type:'geojson',data:parts.data});
  map.addLayer({id:'historyRoute',type:'line',source:'historyRoute',paint:{'line-width':4,'line-opacity':.78}});
 }
 if(parts.all.length){
  const bounds=parts.all.reduce((b,c)=>b.extend(c),new maplibregl.LngLatBounds(parts.all[0],parts.all[0]));
  map.fitBounds(bounds,{padding:55,maxZoom:17});
 }
}
// MapLibre may still be loading its style when evidence arrives.
drawHistory=function(points){
 const id=currentDevice,request=p2HistoryRequest,copy=Array.isArray(points)?points.slice():[];
 const parts=p2BuildHistoryGeometry(copy);
 p2HistoryRouteStats={gaps:parts.gaps,segments:parts.segments};
 const apply=()=>{
  if(!p2HistoryResponseCurrent(id,request,currentDevice,p2HistoryRequest)||!map?.isStyleLoaded())return;
  try{p2DrawHistoryGeometry(parts)}
  catch(error){text('#historyNote','Map route drawing failed: '+String(error?.message||'unknown'))}
 };
 if(map?.isStyleLoaded())apply();else if(map)map.once('style.load',apply);
};
fetchHistory=async function(from,to){
 const id=currentDevice,request=++p2HistoryRequest;
 p2ClearHistoryView();
 if(!id){text('#historyNote','Select a phone before loading history.');return}
 if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||to<from||to-from>31*86400000){
  text('#historyNote','Choose a valid history range of up to 31 days.');return;
 }
 text('#historyNote','Loading selected phone history…');
 try{
  const result=await api('/parent/api/device/'+encodeURIComponent(id)+'/history?from='+from+'&to='+to);
  if(!p2HistoryResponseCurrent(id,request,currentDevice,p2HistoryRequest))return;
  if(!result||!Array.isArray(result.points))throw Error('Invalid history response');
  historyPoints=result.points;
  displayPoints=Array.isArray(result.displayPoints)?result.displayPoints:historyPoints;
  const seek=document.getElementById('seek');
  if(seek)seek.max=String(Math.max(0,historyPoints.length-1));
  if(historyPoints.length)setPlayPoint(0);
  drawHistory(historyPoints);
  renderTimeline(historyPoints);
  const summary=result.summary||{};
  text('#sumDistance',summary.distanceM==null?'—':(summary.distanceM/1000).toFixed(summary.distanceM<10000?2:1)+' km');
  text('#sumDuration',fmtDur(summary.durationMs));
  text('#sumAvg',summary.averageMovingKph==null?'—':Number(summary.averageMovingKph).toFixed(1)+' km/h');
  text('#sumMax',summary.maxTrustedKph==null?'—':Number(summary.maxTrustedKph).toFixed(1)+' km/h');
  text('#sumModes',(summary.modes||[]).join(' → ')||'—');
  text('#sumStops',String((summary.stops||[]).length));
  text('#historyNote',historyPoints.length+' evidence points · '+p2HistoryRouteStats.segments+' drawn route segments'+(p2HistoryRouteStats.gaps?' · '+p2HistoryRouteStats.gaps+' data gaps (not connected)':'')+(result.truncated?' · result truncated':'')+(historyPoints.length?'':' · no recorded journey in this range'));
 }catch(error){
  if(!p2HistoryResponseCurrent(id,request,currentDevice,p2HistoryRequest))return;
  p2ClearHistoryView();
  text('#historyNote','History unavailable: '+String(error?.message||'request failed'));
 }
};

async function p2LoadObservationLogs(){
 const id=currentDevice,root=document.getElementById('phase2LogsList'),status=document.getElementById('phase2LogsStatus');
 if(!id||!root||!status)return;
 status.textContent='Loading observation records…';root.replaceChildren();
 try{
  const result=await api('/parent/api/device/'+encodeURIComponent(id)+'/beta/logs');
  if(currentDevice!==id)return;
  if(result?.source!=='beta_health_observations_only'||result.fullAndroidDiagnosticLogAvailable!==false)throw Error('Unexpected log source');
  const records=Array.isArray(result.logs)?result.logs:[];
  status.textContent=records.length+' beta observations · 7 Singapore calendar days'+(result.truncated?' · latest 100 only':'')+'. Not a full Android diagnostic log.';
  for(const record of records){
   const card=document.createElement('div');card.className='listItem';
   const header=document.createElement('strong');header.textContent=new Date(record.capturedAt||record.receivedAt).toLocaleString()+' · '+(record.status==='ATTENTION'?'Needs review':'Observed');
   const detail=document.createElement('div');detail.className='small';
   const fmt=value=>typeof value==='number'&&Number.isFinite(value)?Math.round(value/1000)+'s':'unknown';
   detail.textContent='Network '+String(record.network||'unknown')+' · location fix age '+fmt(record.locationAgeMs)+' · upload ACK '+fmt(record.ackAgeMs)+' · pending '+(record.pendingRecords??'unknown')+' · receipt '+new Date(record.receivedAt).toLocaleString()+(record.bootChanged?' · reboot recorded':'')+(typeof record.gapMs==='number'&&record.gapMs>180000?' · reporting gap '+fmt(record.gapMs):'');
   card.append(header,detail);root.append(card);
  }
  if(records.length===0){const empty=document.createElement('div');empty.className='small';empty.textContent='No beta observations in the selected window. The phone may not have started a test run or may be offline.';root.append(empty)}
 }catch(error){if(currentDevice===id)status.textContent='Logs unavailable: '+String(error?.message||'request failed')}
}
const p2LogsTab=document.querySelector('.tabs [data-tab="logs"]');
if(p2LogsTab)p2LogsTab.addEventListener('click',p2LoadObservationLogs);
const p2LogRefresh=document.getElementById('refreshLogs');
if(p2LogRefresh)p2LogRefresh.onclick=p2LoadObservationLogs;

let betaLoading=false;
async function betaLoad(){if(betaLoading||!currentDevice)return;const id=currentDevice;betaLoading=true;
 try{const r=await api('/parent/api/device/'+encodeURIComponent(id)+'/beta/status');if(currentDevice!==id)return;
 const release=document.getElementById('betaRelease');release.replaceChildren();if(r.release?.available){const a=document.createElement('a');a.href='/parent/beta/download/apk';a.textContent='Download approved cloud APK ('+String(r.release?.versionName||'version unavailable')+'); check version before updating';release.append(a);}else release.textContent='APK safety update is awaiting validation. No current download is offered.';
 const root=document.getElementById('betaChecks');root.replaceChildren();
 document.getElementById('betaHeadline').textContent=r.latest?(r.latest.stale?'Phone readiness is stale. Rerun checks on the phone.':'Last phone check: '+new Date(r.latest.receivedAt).toLocaleString()):'No phone readiness received. Pair with this beta and run checks on the phone.';
 for(const c of [...(r.latest?.localChecks||[]),...(r.latest?.checks||[])]){const row=document.createElement('p');const title=document.createElement('strong');title.textContent=c.id+' · '+c.status+(c.required===false?' (optional)':'');row.append(title,document.createTextNode(' — '+(c.detail||c.detailCode||'Evidence unavailable')));root.append(row);}
 const e=r.evidence, records=e?.records||[], gap=records.filter(x=>x.observation.bootChanged||Math.abs(x.observation.clockDeltaMs||0)>5000||(x.observation.sameBootGapMs||0)>180000).length;
 document.getElementById('betaRun').textContent=e?'Run '+e.run.runId+' · '+(e.counts?.n||0)+' uploaded observations · last upload '+new Date(e.receivedAt).toLocaleString()+' · '+e.dropped+' phone records dropped · '+gap+' gap/reboot/clock flags in latest '+records.length+' records. REVIEW REQUIRED. Last phone report is not proof of continued activity.':'No endurance observations uploaded. The phone starts the run after all readiness checks and your removal-test confirmation.';
 document.getElementById('betaEvidence').textContent=JSON.stringify(r,null,2);
 }catch(e){if(currentDevice===id)document.getElementById('betaHeadline').textContent='Beta evidence unavailable: '+e.message;}finally{betaLoading=false;}}

// Deliberately do not couple dashboard startup to optional map diagnostics.
const betaOldSelect=selectDevice;selectDevice=async function(id){document.getElementById('betaChecks').replaceChildren();document.getElementById('betaRun').textContent='';document.getElementById('betaEvidence').textContent='';document.getElementById('betaHeadline').textContent='Loading selected phone…';await betaOldSelect(id);if(document.getElementById('brickBeta').open)await betaLoad();};
const betaOldMessage=wsMessage;wsMessage=function(m){betaOldMessage(m);if(m?.type==='beta_challenge'&&m.deviceId===currentDevice&&typeof m.token==='string'&&m.expiresAt>Date.now()){const id=currentDevice;api('/parent/api/device/'+encodeURIComponent(id)+'/beta/ack',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:m.token})}).then(()=>{if(currentDevice===id&&document.getElementById('brickBeta').open)betaLoad();}).catch(()=>{});}};
document.getElementById('betaRefresh').onclick=betaLoad;
document.getElementById('brickBeta').ontoggle=()=>{if(document.getElementById('brickBeta').open)betaLoad();};
document.getElementById('betaImport').onchange=async function(){const file=this.files?.[0],id=currentDevice;if(!file||!id)return;if(file.size>33554432){document.getElementById('betaHeadline').textContent='Export exceeds 32 MB.';return;}try{await api('/parent/api/device/'+encodeURIComponent(id)+'/beta/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify((({format,summary,releaseId,apkSourceSha})=>({format,summary,releaseId,apkSourceSha}))(JSON.parse(await file.text())))});if(currentDevice===id)await betaLoad();}catch(e){if(currentDevice===id)document.getElementById('betaHeadline').textContent='Import failed: '+e.message;}finally{this.value='';}};
setInterval(()=>{if(document.getElementById('brickBeta').open)betaLoad();},15000);
`;
 return html.replace(needle,js+needle);
}
