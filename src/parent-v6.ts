import { parentV5BHtml } from "./parent-v5b";

export function parentV6Html() {
  let html = parentV5BHtml();

  const moduleNeedle = "import { maplibregl, createBrickMap, resolveBrickPlace, getPrivateMapStatus } from '/brick-map.mjs';";
  const modulePatch = moduleNeedle + "import { pairingQrDataUrl } from '/brick-pair.mjs';";
  if (!html.includes(moduleNeedle)) throw new Error("Phase 6 pairing module import target missing");
  html = html.replace(moduleNeedle, modulePatch);

  const deviceNeedle = "o.value=d.id;o.textContent=d.name;s.appendChild(o)";
  const devicePatch = "o.value=d.id;o.dataset.revoked=d.revoked_at?'1':'0';o.textContent=d.name+(d.revoked_at?' · REVOKED':'');s.appendChild(o)";
  if (!html.includes(deviceNeedle)) throw new Error("Phase 6 device-list UI patch target missing");
  html = html.replace(deviceNeedle, devicePatch);

  const selectNeedle = "async function selectDevice(id){currentDevice=id;text('#deviceName',$('#devices').selectedOptions[0]?.textContent||'Device');text('#mapName',$('#devices').selectedOptions[0]?.textContent||'Device');connect(id);await Promise.all([loadEvents(),loadPlaces(),loadTrips(),loadHealthOps(),loadPhase5C(),loadRetention()])}";
  const selectPatch = "async function selectDevice(id){const changed=currentDevice!==id;if(changed){if(marker){marker.remove();marker=null}markerPopup=null;lastMarkerPoint=null;localMapResolveKey='';localMapPlace=privateMapInstalled?'Resolving local map context':'Private basemap not installed'}currentDevice=id;const revoked=$('#devices').selectedOptions[0]?.dataset.revoked==='1';text('#deviceName',$('#devices').selectedOptions[0]?.textContent||'Device');text('#mapName',$('#devices').selectedOptions[0]?.textContent||'Device');if(ws){ws.close();ws=null}if(revoked){try{renderSnapshot(await api('/parent/api/device/'+encodeURIComponent(id)+'/state'))}catch{snapshot=null;renderHealthChecks()}}else connect(id);await Promise.all([loadEvents(),loadPlaces(),loadTrips(),loadHealthOps(),loadPhase5C(),loadBatteryTrend(),loadRetention()]);const rb=$('#revokeDevice');if(rb){rb.disabled=revoked;rb.textContent=revoked?'Device revoked':'Revoke selected phone'}}";
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

  const pairCardNeedle = '<div class="card"><input id="pairName" class="field" value="Child phone" maxlength="64"><button id="pairBtn" class="action secondary">Create 10-minute pairing code</button><div id="pairOut" class="small">—</div></div>';
  const pairCardPatch = '<div class="card"><input id="pairName" class="field" value="Child phone" maxlength="64"><button id="pairBtn" class="action secondary">Create 10-minute pairing QR</button><img id="pairQr" hidden alt="One-time Brick pairing QR" width="260" height="260" style="display:block;max-width:100%;height:auto;margin:12px auto"><div id="pairOut" class="small">—</div></div>';
  if (!html.includes(pairCardNeedle)) throw new Error("Phase 6 pairing QR card target missing");
  html = html.replace(pairCardNeedle, pairCardPatch);

  const pairHandlerNeedle = "$('#pairBtn').onclick=async()=>{try{const j=await api('/parent/api/pair/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:$('#pairName').value})});text('#pairOut','Pairing code: '+j.token+' · expires '+new Date(j.expiresAt).toLocaleTimeString())}catch(e){text('#pairOut',e.message)}};";
  const pairHandlerPatch = "$('#pairBtn').onclick=async()=>{const qr=$('#pairQr');try{const j=await api('/parent/api/pair/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:$('#pairName').value})});qr.src=pairingQrDataUrl(location.origin,j.token);qr.hidden=false;text('#pairOut','Scan this one-time QR in Brick. Manual code: '+j.token+' · expires '+new Date(j.expiresAt).toLocaleTimeString())}catch(e){qr.hidden=true;qr.removeAttribute('src');text('#pairOut',e.message)}};";
  if (!html.includes(pairHandlerNeedle)) throw new Error("Phase 6 pairing QR handler target missing");
  html = html.replace(pairHandlerNeedle, pairHandlerPatch);

  html = html.replaceAll("Promise.all([loadHealthOps(),loadPhase5C()])", "Promise.all([loadHealthOps(),loadPhase5C(),loadBatteryTrend()])");

  const renderTailNeedle = "if(h)text('#network',h.network||'—');renderHealthChecks();renderLiveNotice()}";
  const renderTailPatch = "if(h)text('#network',h.network||'—');const ne=x.networkEvidence||{},coarse=[ne.city,ne.region,ne.country].filter((v,i,a)=>v&&a.indexOf(v)===i).join(' · ');if(coarse&&(!l||l.lat==null||l.lon==null)){text('#mapPlace','Coarse network · '+coarse);text('#mapDetail','No trustworthy coordinate · network context only');text('#quality','coarse network context');text('#accuracy','—');text('#speed','—')}else if(coarse&&d.positionStatus==='unavailable'){text('#mapDetail',($('#mapDetail').textContent||'Last known position')+' · network context '+coarse)}renderHealthChecks();renderLiveNotice()}";
  if (!html.includes(renderTailNeedle)) throw new Error("Phase 6 network-context UI patch target missing");
  html = html.replace(renderTailNeedle, renderTailPatch);

  const scriptNeedle = "const today=new Date(),iso=d=>";
  const helpers = "async function loadBatteryTrend(){if(!currentDevice)return;try{const b=await api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/battery-drain');const rate=b.recent?.ratePctPerHour,base=b.baseline?.ratePctPerHour;const value=b.status==='not_enough_data'?'Not enough data':(b.status==='elevated'?'ELEVATED · ':'Normal · ')+(rate==null?'—':rate.toFixed(1)+'%/h')+(base==null?'':' · baseline '+base.toFixed(1)+'%/h');text('#batteryTrend',value)}catch{text('#batteryTrend','Unavailable')}};$('#revokeDevice').onclick=async()=>{if(!currentDevice)return;const name=$('#devices').selectedOptions[0]?.textContent||'this phone';if(!confirm('Revoke '+name+'? This permanently blocks future uploads from its current device key. Existing history stays available.'))return;try{await api('/parent/api/device/'+encodeURIComponent(currentDevice)+'/revoke',{method:'POST'});showBanner('Device revoked','warn');await loadDevices()}catch(e){showBanner(e.message,'error')}};";
  if (!html.includes(scriptNeedle)) throw new Error("Phase 6 helper patch target missing");
  return html.replace(scriptNeedle, helpers + scriptNeedle);
}
