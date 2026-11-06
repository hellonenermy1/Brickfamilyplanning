/**
 * Reuses the existing tab/pane implementation. It does not inject an external asset
 * or depend on the map, so a failed MapLibre module must not take Logs offline.
 */
export function parentPhase2LogsHtml(base:string):string{
 const tabAnchor='<button data-tab="health">Health</button></nav>';
 const paneAnchor='</div></aside></div>';
 const jsAnchor='const today=new Date(),iso=d=>';
 if(!base.includes(tabAnchor)||!base.includes(paneAnchor)||!base.includes(jsAnchor))throw Error('phase2_logs_parent_hook_missing');
 const pane=`<section id="logs" class="pane"><div class="sectionTitle"><h3>Operational Logs</h3><button type="button" id="opsRefresh">Refresh</button></div>
 <div id="opsNote" class="notice">Select a phone to inspect recent signed beta observations.</div>
 <div class="grid2"><label class="small">Severity<select id="opsSeverity" class="field"><option value="">All</option><option value="INFO">Info</option><option value="WARN">Warning</option><option value="ERROR">Error</option></select></label><label class="small">Event code<input id="opsSearch" class="field" maxlength="60" placeholder="Filter event type"></label></div>
 <div id="opsList" role="region" aria-live="polite"></div>
 <button id="opsMore" class="action secondary" type="button" hidden>Load more</button>
 <p class="small">Retained operational view: today and previous six Singapore calendar days. These are signed beta observations, not the phone's complete local diagnostic log. Safety events and historical endurance evidence follow separate retention.</p></section>`;
 let html=base.replace(tabAnchor,'<button data-tab="health">Health</button><button data-tab="logs">Logs</button></nav>')
  .replace(paneAnchor,pane+paneAnchor);
 html=html.replace('</head>',`<style id="brickP2LogsStyle">.tabs{grid-template-columns:repeat(6,minmax(0,1fr))}#logs .opsEntry{border:1px solid #e1e5e9;border-radius:9px;margin:8px 0;padding:9px;background:#fff;overflow-wrap:anywhere}#logs .opsEntry[data-severity="ERROR"]{border-left:4px solid #b42318}#logs .opsEntry[data-severity="WARN"]{border-left:4px solid #d97706}#logs .opsDetails{font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto}#logs .opsTitle{font-weight:700;font-size:12px}#logs .opsSmall{font-size:11px;color:#667085}</style></head>`);
 const script=String.raw`
let p2OpsOffset=0,p2OpsLoading=false,p2OpsDevice='';
function p2OpsFilter(){
 const search=String(document.getElementById('opsSearch').value||'').trim().toLowerCase();
 const severity=document.getElementById('opsSeverity').value;
 document.querySelectorAll('#opsList .opsEntry').forEach(el=>{el.hidden=!!((severity&&el.dataset.severity!==severity)||(search&&!String(el.dataset.code||'').toLowerCase().includes(search)))});
}
async function p2OpsLoad(more=false){
 const selected=currentDevice;
 if(p2OpsLoading||!selected)return;
 const list=document.getElementById('opsList'),notice=document.getElementById('opsNote'),moreBtn=document.getElementById('opsMore');
 if(!more||p2OpsDevice!==selected){p2OpsDevice=selected;p2OpsOffset=0;list.replaceChildren();}
 p2OpsLoading=true;moreBtn.disabled=true;
 try{
  const data=await api('/parent/api/device/'+encodeURIComponent(selected)+'/ops-logs?limit=50&offset='+p2OpsOffset);
  if(selected!==currentDevice)return;
  notice.textContent='Showing signed beta-test observations for the last 7 local calendar dates. Android full diagnostic logs are not uploaded by this APK.';
  for(const item of data.items||[]){
   const el=document.createElement('div');el.className='opsEntry';el.dataset.severity=item.severity;el.dataset.code=item.eventCode;
   const title=document.createElement('div');title.className='opsTitle';title.textContent=item.severity+' · '+String(item.eventCode).replaceAll('_',' ');
   const time=document.createElement('div');time.className='opsSmall';time.textContent='Phone: '+new Date(item.capturedAt).toLocaleString()+' · Server: '+new Date(item.receivedAt).toLocaleString();
   const detail=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');
   summary.textContent='Details';pre.className='opsDetails';pre.textContent=JSON.stringify(item.detail||{},null,2);detail.append(summary,pre);
   el.append(title,time,detail);list.append(el);
  }
  p2OpsOffset=typeof data.nextOffset==='number'?data.nextOffset:p2OpsOffset;
  moreBtn.hidden=typeof data.nextOffset!=='number';
  if(!list.children.length){const empty=document.createElement('div');empty.className='notice';empty.textContent='No beta observations are available in this period. This does not prove the phone is healthy; the test may not be running or observations may be delayed.';list.append(empty);}
  p2OpsFilter();
 }catch(error){
  if(selected===currentDevice)notice.textContent='Cannot load operational observations: '+String(error?.message||'unknown error');
 }finally{p2OpsLoading=false;moreBtn.disabled=false;}
}
document.getElementById('opsRefresh').addEventListener('click',()=>p2OpsLoad(false));
document.getElementById('opsMore').addEventListener('click',()=>p2OpsLoad(true));
document.getElementById('opsSeverity').addEventListener('change',p2OpsFilter);
document.getElementById('opsSearch').addEventListener('input',p2OpsFilter);
document.querySelector('[data-tab="logs"]').addEventListener('click',()=>p2OpsLoad(false));
`;
 return html.replace(jsAnchor,script+jsAnchor);
}
