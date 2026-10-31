import { parentV5BHtml } from "./parent-v5b";

export function parentV6Html() {
  let html = parentV5BHtml();

  const deviceNeedle = "o.value=d.id;o.textContent=d.name;s.appendChild(o)";
  const devicePatch = "o.value=d.id;o.dataset.revoked=d.revoked_at?'1':'0';o.textContent=d.name+(d.revoked_at?' · REVOKED':'');s.appendChild(o)";
  if (!html.includes(deviceNeedle)) throw new Error("Phase 6 device-list UI patch target missing");
  html = html.replace(deviceNeedle, devicePatch);

  const selectNeedle = "async function selectDevice(id){currentDevice=id;text('#deviceName',$('#devices').selectedOptions[0]?.textContent||'Device');text('#mapName',$('#devices').selectedOptions[0]?.textContent||'Device');connect(id);await Promise.all([loadEvents(),loadPlaces(),loadTrips(),loadHealthOps(),loadPhase5C(),loadRetention()])}";
  const selectPatch = "async function selectDevice(id){currentDevice=id;const revoked=$('#devices').selectedOptions[0]?.dataset.revoked==='1';text('#deviceName',$('#devices').selectedOptions[0]?.textContent||'Device');text('#mapName',$('#devices').selectedOptions[0]?.textContent||'Device');if(ws){ws.close();ws=null}if(revoked){try{renderSnapshot(await api('/parent/api/device/'+encodeURIComponent(id)+'/state'))}catch{snapshot=null;renderHealthChecks()}}else connect(id);await Promise.all([loadEvents(),loadPlaces(),loadTrips(),loadHealthOps(),loadPhase5C(),loadBatteryTrend(),loadRetention()]);const rb=$('#revokeDevice');if(rb){rb.disabled=revoked;rb.textContent=revoked?'Device revoked':'Revoke selected phone'}}";
  if (!html.includes(selectNeedle)) throw new Error("Phase 6 device-select UI patch target missing");
  html = html.replace(selectNeedle, selectPatch);

  const journalNeedle = '<div class="row"><span>Local journal</span><b id="journalState">—</b></div></div>';
  const journalPatch = '<div class="row"><span>Local journal</span><b id="journalState">—</b></div><div class="row"><span>Battery drain</span><b id="batteryTrend">Not measured</b></div></div>';
  if (!html.includes(journalNeedle)) throw new Error("Phase 6 battery UI patch target missing");
  html = html.replace(journalNeedle, journalPatch);

  const sectionNeedle = '<div class="sectionTitle" style="margin-top:16px"><h3>Pair another phone</h3></div>';
  const sectionPatch = '<div class="sectionTitle" style="margin-top:16px"><h3>Device access</h3></div><div class="card"><button id="revokeDevice" class="action danger">Revoke selected phone</button><div class="small">Revocation permanently stops future uploads from this device key. Existing history remains read-only.</div></div>'+sectionNeedle;
  if (!html.includes(sectionNeedle)) throw new Error("Phase 6 revoke UI patch target missing");
  html = html.replace(sectionNeedle, sectionPatch);

  html = html.replaceAll("Promise.all([loadHealthOps(),loadPhase5C()])", "Promise.all([loadHealthOps(),loadPhase5C(),loadBatteryTrend()])");

  const scriptNeedle = "const today=new Date(),iso=d=>";
  const helpers = "async function loadBatteryTrend(){if(!currentDevice)return;try{const b=await api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/battery-drain');const rate=b.recent?.ratePctPerHour,base=b.baseline?.ratePctPerHour;const value=b.status==='not_enough_data'?'Not enough data':(b.status==='elevated'?'ELEVATED · ':'Normal · ')+(rate==null?'—':rate.toFixed(1)+'%/h')+(base==null?'':' · baseline '+base.toFixed(1)+'%/h');text('#batteryTrend',value)}catch{text('#batteryTrend','Unavailable')}};$('#revokeDevice').onclick=async()=>{if(!currentDevice)return;const name=$('#devices').selectedOptions[0]?.textContent||'this phone';if(!confirm('Revoke '+name+'? This permanently blocks future uploads from its current device key. Existing history stays available.'))return;try{await api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/revoke',{method:'POST'});showBanner('Device revoked','warn');await loadDevices()}catch(e){showBanner(e.message,'error')}};";
  if (!html.includes(scriptNeedle)) throw new Error("Phase 6 helper patch target missing");
  return html.replace(scriptNeedle, helpers + scriptNeedle);
}
