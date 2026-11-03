import { parentV6Html } from "./parent-v6";

function replaceOnce(input: string, needle: string, replacement: string, label: string) {
  if (!input.includes(needle)) throw new Error(`Phase 8 production parent patch target missing: ${label}`);
  return input.replace(needle, replacement);
}

/**
 * Production-only Phase 8 truth layer. This deliberately builds on the normal Phase 6 parent UI,
 * not the development/debug portal. It keeps last-known geometry visible, but never presents stale
 * event-time, speed or movement as if they were live.
 */
export function parentV8Html() {
  let html = parentV6Html();

  html = replaceOnce(
    html,
    '<div class="metric"><span>Position</span><b id="quality">—</b></div>',
    '<div class="metric"><span>Position</span><b id="quality">—</b></div><div class="metric"><span>Freshness</span><b id="freshness">—</b></div><div class="metric"><span>Source</span><b id="positionSource">—</b></div>',
    "freshness/source metrics"
  );

  const scriptNeedle = "const today=new Date(),iso=d=>";
  const helpers = `
function p8Record(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:null}
function p8Num(v){return typeof v==='number'&&Number.isFinite(v)?v:null}
function p8Age(now,t){const n=p8Num(t);return n==null?null:Math.max(0,now-n)}
function p8PositionAge(l){if(!l)return null;const now=Date.now(),ages=[p8Age(now,l.wallTimeMs),p8Age(now,l.receivedAt)].filter(v=>v!=null);return ages.length?Math.max(...ages):null}
function p8ReceiveAge(l){return l?p8Age(Date.now(),l.receivedAt):null}
function p8Freshness(l,h){const age=p8PositionAge(l);if(age==null)return'unknown';const raw=p8Num(h?.trackingIntervalMs)??5000,interval=Math.max(1000,Math.min(300000,raw)),staleAt=Math.max(60000,interval*3+30000),freshAt=Math.max(15000,Math.min(staleAt/2,interval*1.5+5000));return age<=freshAt?'fresh':age<=staleAt?'aging':'stale'}
function p8PresentationMatches(p,l){if(!p||!l)return false;const b=p8Record(p.basis);if(!b)return false;if(Number.isFinite(b.epoch)&&Number.isFinite(b.sequence)&&Number.isFinite(l.epoch)&&Number.isFinite(l.sequence))return b.epoch===l.epoch&&b.sequence===l.sequence;return Number.isFinite(b.receivedAt)&&Number.isFinite(l.receivedAt)&&b.receivedAt===l.receivedAt}
function p8Title(v){return String(v||'unknown').replaceAll('_',' ').replace(/\\b\\w/g,c=>c.toUpperCase())}
function p8TruthNotice(message,level='warn'){const root=$('#liveNotice');if(!root)return;root.replaceChildren();const n=document.createElement('div');n.className='notice '+level;n.textContent=message;root.appendChild(n)}
function p8ApplyTruth(x){if(!x)return;const l=x.latest||x.state||null,h=x.health||null,p=p8Record(x.presentation),d=p8Record(x.derived)||{},matches=p8PresentationMatches(p,l),fallbackFresh=p8Freshness(l,h),freshness=matches&&typeof p.freshness==='string'?p.freshness:fallbackFresh,source=matches&&typeof p.source==='string'?p.source:l?.source||'unknown',captureAge=Number.isFinite(d.captureAgeMs)?Math.max(0,d.captureAgeMs):p8PositionAge(l),receiveAge=Number.isFinite(d.receiveAgeMs)?Math.max(0,d.receiveAgeMs):p8ReceiveAge(l),positionStatus=typeof d.positionStatus==='string'?d.positionStatus:(freshness==='fresh'?'fresh':freshness==='unknown'?'unavailable':'stale'),deviceStatus=typeof d.deviceStatus==='string'?d.deviceStatus:'unknown';text('#freshness',p8Title(freshness));text('#positionSource',p8Title(source));if(!l){text('#updatedHeader','Captured —');text('#speed','—');text('#movement','—');text('#mapDetail','No trustworthy current coordinate');return}const captured=captureAge==null?'Captured —':'Captured '+fmtAge(captureAge)+' ago',received=receiveAge==null?'':' · cloud received '+fmtAge(receiveAge)+' ago';text('#updatedHeader',captured+received);setStatus($('#positionStatus'),'POSITION',positionStatus);if(deviceStatus&&deviceStatus!=='unknown')setStatus($('#deviceStatus'),'DEVICE',deviceStatus);const stale=positionStatus==='stale'||freshness==='stale'||deviceStatus==='offline',aging=!stale&&freshness==='aging',unavailable=positionStatus==='unavailable';if(stale){text('#speed','—');text('#movement','Last known · '+(l.activity||'unknown'));text('#quality',(l.quality||'—')+' · stale');text('#mapDetail','Historical position'+(captureAge==null?'':' · captured '+fmtAge(captureAge)+' ago')+(l.uncertaintyM==null?'':' · ±'+Math.round(l.uncertaintyM)+' m'));p8TruthNotice('Last known position'+(captureAge==null?'':' captured '+fmtAge(captureAge)+' ago')+'. This is not a live location.','bad')}else if(aging){text('#speed','—');text('#movement','Recent · '+(l.activity||'unknown'));text('#quality',(l.quality||'—')+' · aging');text('#mapDetail','Aging position'+(captureAge==null?'':' · captured '+fmtAge(captureAge)+' ago')+(l.uncertaintyM==null?'':' · ±'+Math.round(l.uncertaintyM)+' m'));p8TruthNotice('Position is aging and may no longer describe the phone’s current location.','warn')}else if(unavailable){text('#speed','—');text('#movement','Unknown');text('#quality','unavailable');text('#mapDetail','No trustworthy current coordinate');p8TruthNotice('No trustworthy current position is available.','warn')}}
const p8OriginalRenderSnapshot=renderSnapshot;renderSnapshot=function(x){p8OriginalRenderSnapshot(x);p8ApplyTruth(x)};
`;
  html = replaceOnce(html, scriptNeedle, helpers + scriptNeedle, "event-time truth renderer");
  return html;
}
