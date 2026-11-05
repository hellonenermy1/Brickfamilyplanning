/** Adds a test drawer and selected-device socket receipt without replacing existing portal features. */
export function parentBetaHtml(base:string){
 const needle='const today=new Date(),iso=d=>';
 if(!base.includes(needle)||!base.includes('<body'))throw Error('beta_parent_hook_missing');
 const panel=`<details id="brickBeta" style="position:fixed;right:12px;bottom:12px;z-index:500;background:#fff;color:#18362d;border:2px solid #26755c;border-radius:12px;box-shadow:0 5px 25px #0003;max-width:calc(100vw - 24px);width:420px;padding:12px"><summary style="cursor:pointer;font-weight:800">BETA · Test centre</summary><div style="max-height:65vh;overflow:auto"><p>Controlled beta. The 72-hour run needs review; elapsed time alone never means a pass.</p><p id="betaRelease"><a href="/parent/beta/download/manifest">APK release status</a></p><button type="button" id="betaRefresh">Refresh selected phone</button><p id="betaHeadline" role="status">Select a phone to view its test evidence.</p><div id="betaChecks"></div><p id="betaRun"></p><p>Phone stop state and manual interventions are available in its private export. Import it here after stopping the run; imports remain labelled as parent-provided evidence.</p><label>Import phone evidence <input id="betaImport" type="file" accept="application/json,.json"></label><details><summary>Detailed evidence</summary><pre id="betaEvidence" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></details></div></details>`;
 let html=base.replace(/(<body[^>]*>)/,'$1'+panel);
 // Beta only: keep the tracking map compact while allowing the controls to scroll normally.
 // Desktop is half-height; mobile is slightly shorter. This does not change GPS state.
 const compactMapCss=`<style id="brickBetaCompactMap">
 @media(min-width:901px){
 .shell{height:auto;min-height:calc(100vh - 64px);align-items:start}
 .mapWrap{height:clamp(320px,50vh,560px);position:sticky;top:64px}
 .side{min-height:calc(100vh - 64px)}
 .content{overflow:visible}
 }
 @media(max-width:900px){
 .shell{height:auto;min-height:0}
 .mapWrap{height:clamp(260px,42vh,420px);min-height:260px;position:relative;top:auto}
 .side{min-height:0}
 }
 </style>`;
 if(!html.includes('</head>'))throw Error('beta_parent_head_missing');
 html=html.replace('</head>',compactMapCss+'</head>');
 const js=String.raw`
let betaLoading=false;
async function betaLoad(){if(betaLoading||!currentDevice)return;const id=currentDevice;betaLoading=true;
 try{const r=await api('/parent/api/device/'+encodeURIComponent(id)+'/beta/status');if(currentDevice!==id)return;
 const release=document.getElementById('betaRelease');release.replaceChildren();if(r.release?.available){const a=document.createElement('a');a.href='/parent/beta/download/apk';a.textContent='Download current signed APK';release.append(a);}else release.textContent='APK safety update is awaiting validation. No current download is offered.';
 const root=document.getElementById('betaChecks');root.replaceChildren();
 document.getElementById('betaHeadline').textContent=r.latest?(r.latest.stale?'Phone readiness is stale. Rerun checks on the phone.':'Last phone check: '+new Date(r.latest.receivedAt).toLocaleString()):'No phone readiness received. Pair with this beta and run checks on the phone.';
 for(const c of [...(r.latest?.localChecks||[]),...(r.latest?.checks||[])]){const row=document.createElement('p');const title=document.createElement('strong');title.textContent=c.id+' · '+c.status+(c.required===false?' (optional)':'');row.append(title,document.createTextNode(' — '+(c.detail||c.detailCode||'Evidence unavailable')));root.append(row);}
 const e=r.evidence, records=e?.records||[], gap=records.filter(x=>x.observation.bootChanged||Math.abs(x.observation.clockDeltaMs||0)>5000||(x.observation.sameBootGapMs||0)>180000).length;
 document.getElementById('betaRun').textContent=e?'Run '+e.run.runId+' · '+(e.counts?.n||0)+' uploaded observations · last upload '+new Date(e.receivedAt).toLocaleString()+' · '+e.dropped+' phone records dropped · '+gap+' gap/reboot/clock flags in latest '+records.length+' records. REVIEW REQUIRED. Last phone report is not proof of continued activity.':'No endurance observations uploaded. The phone starts the run after all readiness checks and your removal-test confirmation.';
 document.getElementById('betaEvidence').textContent=JSON.stringify(r,null,2);
 }catch(e){if(currentDevice===id)document.getElementById('betaHeadline').textContent='Beta evidence unavailable: '+e.message;}finally{betaLoading=false;}}
const betaOldSelect=selectDevice;selectDevice=async function(id){document.getElementById('betaChecks').replaceChildren();document.getElementById('betaRun').textContent='';document.getElementById('betaEvidence').textContent='';document.getElementById('betaHeadline').textContent='Loading selected phone…';await betaOldSelect(id);if(document.getElementById('brickBeta').open)await betaLoad();};
const betaOldMessage=wsMessage;wsMessage=function(m){betaOldMessage(m);if(m?.type==='beta_challenge'&&m.deviceId===currentDevice&&typeof m.token==='string'&&m.expiresAt>Date.now()){const id=currentDevice;api('/parent/api/device/'+encodeURIComponent(id)+'/beta/ack',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:m.token})}).then(()=>{if(currentDevice===id&&document.getElementById('brickBeta').open)betaLoad();}).catch(()=>{});}};
document.getElementById('betaRefresh').onclick=betaLoad;
document.getElementById('brickBeta').ontoggle=()=>{if(document.getElementById('brickBeta').open)betaLoad();};
document.getElementById('betaImport').onchange=async function(){const file=this.files?.[0],id=currentDevice;if(!file||!id)return;if(file.size>33554432){document.getElementById('betaHeadline').textContent='Export exceeds 32 MB.';return;}try{await api('/parent/api/device/'+encodeURIComponent(id)+'/beta/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify((({format,summary,releaseId,apkSourceSha})=>({format,summary,releaseId,apkSourceSha}))(JSON.parse(await file.text())))});if(currentDevice===id)await betaLoad();}catch(e){if(currentDevice===id)document.getElementById('betaHeadline').textContent='Import failed: '+e.message;}finally{this.value='';}};
setInterval(()=>{if(document.getElementById('brickBeta').open)betaLoad();},15000);
`;
 return html.replace(needle,js+needle);
}
