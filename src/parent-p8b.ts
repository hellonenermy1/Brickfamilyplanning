function replaceOnce(input:string, needle:string, replacement:string, label:string){
  if(!input.includes(needle)) throw new Error(`P8B parent patch target missing: ${label}`);
  return input.replace(needle,replacement);
}

/** Final V1 implementation-reality overlay. Keeps Phase 8 truth UI and adds the newly frozen 8A controls. */
export function parentP8BHtml(base:string){
  let html=base;
  html=html.replace('<span>Parent setting</span><b id="gpsDesired">—</b>','<span>Last parent command</span><b id="gpsDesired">—</b>');
  html=html.replace('<span>Phone reports</span><b id="gpsActual">—</b>','<span>Current phone state</span><b id="gpsActual">—</b>');

  const pair='<div class="sectionTitle" style="margin-top:16px"><h3>Pair another phone</h3></div>';
  const controls=`<div class="sectionTitle" style="margin-top:16px"><h3>Live controls & summaries</h3></div>
<div class="card">
  <div class="row"><span>Live Track</span><b id="p8bLiveState">—</b></div>
  <div style="display:flex;gap:8px;margin:10px 0"><button id="p8bLiveOn" class="action secondary">Start Live Track</button><button id="p8bLiveOff" class="action secondary">Stop</button></div>
  <div class="row"><span>Screen time today</span><b id="p8bScreen">—</b></div>
  <div class="row"><span>Recent commutes</span><b id="p8bCommutes">—</b></div>
  <div class="small" id="p8bCommuteDetail">—</div>
</div>
<div class="sectionTitle" style="margin-top:16px"><h3>Wi-Fi schedule</h3></div>
<div class="card">
  <div class="row"><span>Bedtime OFF</span><input id="p8bWifiOff" type="time" value="22:00"></div>
  <div class="row"><span>Morning ON</span><input id="p8bWifiOn" type="time" value="06:00"></div>
  <div class="row"><span>Days mask (1–127)</span><input id="p8bWifiDays" class="field" value="127" inputmode="numeric"></div>
  <div class="row"><span>Grace minutes</span><input id="p8bWifiGrace" class="field" value="15" inputmode="numeric"></div>
  <button id="p8bWifiSave" class="action secondary">Save Wi-Fi schedule</button>
  <div class="small" id="p8bWifiStatus">—</div>
</div>
<div class="sectionTitle" style="margin-top:16px"><h3>Device name</h3></div>
<div class="card"><input id="p8bRename" class="field" maxlength="64" placeholder="Child phone"><button id="p8bRenameBtn" class="action secondary">Rename</button><div class="small" id="p8bRenameStatus">—</div></div>`;
  html=replaceOnce(html,pair,controls+pair,'control cards');

  const scriptNeedle='const today=new Date(),iso=d=>';
  const helpers=`
function p8bTimeMinute(v){const m=String(v||'').match(/^(\\d{2}):(\\d{2})$/);if(!m)return null;const h=Number(m[1]),n=Number(m[2]);return h>=0&&h<24&&n>=0&&n<60?h*60+n:null}
async function p8bLoadLocation(){if(!currentDevice)return;try{const s=await api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/location-control'),c=s.lastCommand||null; text('#gpsDesired',c?(c.targetEnabled?'ON':'OFF')+' · '+String(c.status||'unknown'):'None'); text('#gpsActual',s.actualEnabled==null?'Unknown':s.actualEnabled?'ON':'OFF'); const age=c?.completedAtMs||c?.issuedAtMs; text('#gpsControlStatus',c?(c.status==='pending'?'Command pending phone confirmation.':'Last command '+String(c.status)+(age?' · '+fmtAge(Math.max(0,Date.now()-age))+' ago':'')):'No parent Location command yet.'); const revoked=$('#devices').selectedOptions[0]?.dataset.revoked==='1';setGpsButtons(locationControlBusy||revoked)}catch(e){text('#gpsControlStatus','Location control unavailable');setGpsButtons(false)}}
loadLocationControl=p8bLoadLocation;
async function p8bLive(active){if(!currentDevice)return;try{await api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/live-track',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({active})});await p8bLoadExtras()}catch(e){text('#p8bLiveState',e.message)}}
async function p8bLoadExtras(){if(!currentDevice)return;try{const [l,w,s,c]=await Promise.all([api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/live-track'),api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/wifi-schedules'),api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/screen-time?days=1'),api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/commutes?limit=5')]);const lc=l.lastCommand;text('#p8bLiveState',lc?(lc.actualActive===true?'ACTIVE':lc.status==='pending'?'PENDING':String(lc.status||'OFF').toUpperCase()):'OFF');const rows=Array.isArray(s.days)?s.days:Array.isArray(s.rows)?s.rows:[];const total=rows.reduce((a,x)=>a+Number(x.totalForegroundMs||x.total_ms||0),0);text('#p8bScreen',total?Math.round(total/60000)+' min':'—');const comm=Array.isArray(c.commutes)?c.commutes:[];text('#p8bCommutes',String(comm.length));text('#p8bCommuteDetail',comm.length?comm.map(x=>String(x.transport_mode||'unknown')+' · '+Math.round(Number(x.distance_m||0)/100)/10+' km · '+Math.round(Number(x.duration_ms||0)/60000)+' min').join(' | '):'No trusted commute summary yet.');const ss=Array.isArray(w.schedules)?w.schedules:[];for(const x of ss){const min=Number(x.local_minute_of_day);if(!Number.isInteger(min))continue;const t=String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0');if(Number(x.target_enabled)===0)$('#p8bWifiOff').value=t;else $('#p8bWifiOn').value=t}text('#p8bWifiStatus',w.lastPhoneResult?'Last phone result: '+String(w.lastPhoneResult.status||'unknown'):'Schedule loaded.')}catch(e){text('#p8bLiveState','Unavailable');text('#p8bWifiStatus','Controls unavailable')}}
async function p8bSaveWifi(){const off=p8bTimeMinute($('#p8bWifiOff').value),on=p8bTimeMinute($('#p8bWifiOn').value),days=Number($('#p8bWifiDays').value),grace=Number($('#p8bWifiGrace').value);if(off==null||on==null||!Number.isInteger(days)||days<1||days>127||!Number.isInteger(grace)||grace<1||grace>120){text('#p8bWifiStatus','Check time, days mask and grace.');return}try{await api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/wifi-schedules',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({schedules:[{id:'bedtime-off',enabled:true,targetEnabled:false,localMinuteOfDay:off,daysMask:days,graceMinutes:grace},{id:'morning-on',enabled:true,targetEnabled:true,localMinuteOfDay:on,daysMask:days,graceMinutes:grace}]})});text('#p8bWifiStatus','Saved. Phone will apply locally and report actual result.');await p8bLoadExtras()}catch(e){text('#p8bWifiStatus',e.message)}}
async function p8bRename(){const name=$('#p8bRename').value.trim();if(!name)return;try{await api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/rename',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});text('#p8bRenameStatus','Renamed.');await loadDevices()}catch(e){text('#p8bRenameStatus',e.message)}}
$('#p8bLiveOn').onclick=()=>p8bLive(true);$('#p8bLiveOff').onclick=()=>p8bLive(false);$('#p8bWifiSave').onclick=p8bSaveWifi;$('#p8bRenameBtn').onclick=p8bRename;
const p8bOldSelect=selectDevice;selectDevice=async function(id){await p8bOldSelect(id);await p8bLoadExtras()};
`;
  html=replaceOnce(html,scriptNeedle,helpers+scriptNeedle,'P8B script hooks');
  return html;
}
