/** Adds a test drawer and selected-device socket receipt without replacing existing portal features. */
export function parentBetaHtml(base:string){
 const needle='const today=new Date(),iso=d=>';
 if(!base.includes(needle)||!base.includes('<body'))throw Error('beta_parent_hook_missing');
 const panel=`<details id="brickBeta" style="position:fixed;right:12px;bottom:12px;z-index:500;background:#fff;color:#18362d;border:2px solid #26755c;border-radius:12px;box-shadow:0 5px 25px #0003;max-width:calc(100vw - 24px);width:420px;padding:12px"><summary style="cursor:pointer;font-weight:800">BETA · Test centre</summary><div style="max-height:65vh;overflow:auto"><p>Controlled beta. The 72-hour run needs review; elapsed time alone never means a pass.</p><p id="betaRelease"><a href="/parent/beta/download/manifest">APK release status</a></p><button type="button" id="betaRefresh">Refresh selected phone</button><p id="betaHeadline" role="status">Select a phone to view its test evidence.</p><div id="betaChecks"></div><p id="betaRun"></p><p>Phone stop state and manual interventions are available in its private export. Import it here after stopping the run; imports remain labelled as parent-provided evidence.</p><label>Import phone evidence <input id="betaImport" type="file" accept="application/json,.json"></label><details><summary>Detailed evidence</summary><pre id="betaEvidence" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></details></div></details>`;
 let html=base.replace(/(<body[^>]*>)/,'$1'+panel);
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
const js=String.raw`

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
// MapLibre may still be loading its style when a history request completes.
// Defer route drawing rather than swallowing all playback behind the API catch block.
const p2OriginalDrawHistory=drawHistory;
drawHistory=function(points){
 const id=currentDevice,copy=Array.isArray(points)?points.slice():[];
 const apply=()=>{if(id!==currentDevice||!map?.isStyleLoaded())return;try{p2OriginalDrawHistory(copy)}catch(error){text('#historyNote','Map route drawing failed: '+String(error?.message||'unknown'))}};
 if(map?.isStyleLoaded())apply();else if(map)map.once('style.load',apply);
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
