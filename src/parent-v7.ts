import { parentV6DHtml } from "./parent-v6d";

function replaceOnce(input: string, needle: string, replacement: string, label: string) {
  if (!input.includes(needle)) throw new Error(`Phase 7 parent patch target missing: ${label}`);
  return input.replace(needle, replacement);
}

export function parentV7Html() {
  let html = parentV6DHtml();

  html = html.replace(
    '<title>Brick Parent · Development Beta 5</title>',
    '<title>Brick Parent · Phase 7 Development</title>'
  );
  html = html.replace('>DEVELOPMENT BETA</span>', '>PHASE 7 BETA</span>');
  html = html.replace('development · Phase 6C', 'development · Phase 7');
  html = html.replace('BRICK PARENT PORTAL — PHASE 6C DEVELOPMENT REPORT', 'BRICK PARENT PORTAL — PHASE 7 DEVELOPMENT REPORT');
  html = html.replace("portalLog('info','Phase 6C development portal loaded')", "portalLog('info','Phase 7 development portal loaded')");

  html = replaceOnce(
    html,
    '</style></head>',
    `.p7Panel{border:1px solid #dfe3e8;border-radius:14px;padding:13px;margin:0 0 13px;background:#fff}.p7Panel .sectionTitle{margin-top:0}.p7Evidence{display:grid;gap:7px;margin-top:10px}.p7EvidenceItem{border:1px solid #e7eaee;border-radius:10px;padding:9px;background:#fbfcfe}.p7EvidenceTop{display:flex;align-items:center;justify-content:space-between;gap:10px}.p7EvidenceTop b{font-size:12px}.p7EvidenceMeta{font-size:10px;color:#667085;margin-top:3px}.p7EvidenceText{font-size:11px;line-height:1.45;color:#475467;margin-top:5px}.p7Conflict{margin-top:9px;padding:9px;border-radius:9px;background:#fff5e5;color:#8a4f00;font-size:11px;line-height:1.45}.p7Empty{font-size:11px;color:#667085;padding:4px 0}.p7Geom{letter-spacing:.03em}.p7VeryLow{color:#b42318}.p7Low{color:#9a5700}.p7Medium{color:#475467}.p7High{color:#137333}
</style></head>`,
    'Phase 7 styles'
  );

  html = replaceOnce(
    html,
    '<div class="sectionTitle"><h3>Recent safety</h3><button id="refreshEvents">Refresh</button></div>',
    `<div class="p7Panel"><div class="sectionTitle"><h3>Why this position</h3><span id="p7Shape" class="pill p7Geom">WAITING</span></div><div class="devGrid"><div class="devStat"><span>Confidence</span><b id="p7Confidence">—</b></div><div class="devStat"><span>Evidence freshness</span><b id="p7EvidenceAge">—</b></div><div class="devStat"><span>Geometry</span><b id="p7Geometry">—</b></div><div class="devStat"><span>Presentation source</span><b id="p7PresentationSource">—</b></div></div><div id="p7Explanation" class="devHint">Waiting for the Phase 7 position contract.</div><div id="p7Conflict" class="p7Conflict" hidden></div><div id="p7Evidence" class="p7Evidence"><div class="p7Empty">No evidence explanation loaded yet.</div></div></div><div class="sectionTitle"><h3>Recent safety</h3><button id="refreshEvents">Refresh</button></div>`,
    'position explanation panel'
  );

  const updateNeedle = 'function updateDebugPanel(){renderBetaTrust();';
  const updatePatch = 'function updateDebugPanel(){renderBetaTrust();renderPhase7Position();';
  html = replaceOnce(html, updateNeedle, updatePatch, 'Phase 7 render hook');

  const scriptNeedle = "const today=new Date(),iso=d=>";
  const helpers = `function p7Text(v){return String(v??'—').replaceAll('_',' ')}function p7Age(ms){return Number.isFinite(ms)?fmtAge(Math.max(0,ms))+' ago':'—'}function renderPhase7Position(){const p=snapshot?.presentation,root=$('#p7Evidence'),conflict=$('#p7Conflict');if(!root||!conflict)return;if(!p){const l=betaPosition();text('#p7Shape',l?'LEGACY STATE':'WAITING');text('#p7Confidence','—');text('#p7EvidenceAge',l?.receivedAt?p7Age(Date.now()-l.receivedAt):'—');text('#p7Geometry','—');text('#p7PresentationSource',l?.source?p7Text(l.source):'—');text('#p7Explanation',l?'Phase 7 presentation is waiting for the next authenticated state refresh. Existing live tracking remains active.':'Waiting for phone state.');root.replaceChildren();const n=document.createElement('div');n.className='p7Empty';n.textContent='No Phase 7 evidence explanation loaded yet.';root.appendChild(n);conflict.hidden=true;return}const shape=String(p.geometry?.kind||'NONE');text('#p7Shape',shape);const confidence=String(p.confidence||'very_low'),confidenceEl=$('#p7Confidence');if(confidenceEl){confidenceEl.textContent=p7Text(confidence).toUpperCase();confidenceEl.className=confidence==='high'?'p7High':confidence==='medium'?'p7Medium':confidence==='low'?'p7Low':'p7VeryLow'}text('#p7EvidenceAge',p7Age(p.evidenceAgeMs));text('#p7Geometry',shape+(Number.isFinite(p.geometry?.radiusM)?' · ±'+Math.round(p.geometry.radiusM)+' m':''));text('#p7PresentationSource',p7Text(p.source));text('#p7Explanation',p.explanation||'—');root.replaceChildren();for(const e of p.evidence||[]){const item=document.createElement('div');item.className='p7EvidenceItem';const top=document.createElement('div');top.className='p7EvidenceTop';const name=document.createElement('b');name.textContent=e.label||p7Text(e.kind);const age=document.createElement('span');age.className='small';age.textContent=Number.isFinite(e.ageMs)?p7Age(e.ageMs):'age unknown';top.append(name,age);const meta=document.createElement('div');meta.className='p7EvidenceMeta';meta.textContent=(e.kind?p7Text(e.kind):'evidence')+(Number.isFinite(e.radiusM)?' · region ±'+Math.round(e.radiusM)+' m':'');const detail=document.createElement('div');detail.className='p7EvidenceText';detail.textContent=e.explanation||'Evidence contributed to this position.';item.append(top,meta,detail);root.appendChild(item)}if(!root.children.length){const n=document.createElement('div');n.className='p7Empty';n.textContent='Brick has no trustworthy evidence to explain for this state.';root.appendChild(n)}const conflicts=Array.isArray(p.conflicts)?p.conflicts:[];if(conflicts.length){conflict.hidden=false;conflict.textContent='Evidence conflict detected. Brick widened uncertainty instead of choosing a falsely precise location. '+conflicts.length+' conflict'+(conflicts.length===1?'':'s')+' recorded.'}else conflict.hidden=true}`;
  html = replaceOnce(html, scriptNeedle, helpers + scriptNeedle, 'Phase 7 browser helpers');

  return html;
}
