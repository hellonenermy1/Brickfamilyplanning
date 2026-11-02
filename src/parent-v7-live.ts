import { parentV7Html } from "./parent-v7";

function replaceOnce(input: string, needle: string, replacement: string, label: string) {
  if (!input.includes(needle)) throw new Error(`Phase 7 live-sync patch target missing: ${label}`);
  return input.replace(needle, replacement);
}

/**
 * Final browser-integrity layer for Phase 7 development. WebSocket health can arrive between the
 * periodic authenticated REST snapshots that carry normalized healthPresentation. Never keep
 * rendering an older normalized provider/position-health conclusion against a newer heartbeat.
 * The live location fallback is also deliberately conservative: only PRECISE/ASSISTED may render
 * as an exact point/circle while an unrecognized/UNKNOWN quality renders no current point.
 */
export function parentV7LiveHtml() {
  let html = parentV7Html();

  const liveGeometryNeedle = "kind=!has?'NONE':q==='estimated'&&cands.length?'CORRIDOR':q==='anchored'?'ANCHORED_AREA':q==='last_known'?'LAST_KNOWN_AREA':q==='estimated'||q==='coarse'?'AREA':'CIRCLE'";
  const liveGeometryPatch = "kind=!has?'NONE':q==='precise'||q==='assisted'?'CIRCLE':q==='estimated'&&cands.length?'CORRIDOR':q==='anchored'?'ANCHORED_AREA':q==='last_known'?'LAST_KNOWN_AREA':q==='estimated'||q==='coarse'?'AREA':'NONE'";
  html = replaceOnce(html, liveGeometryNeedle, liveGeometryPatch, 'conservative live fallback geometry');

  const healthNeedle = "function renderPhase7Health(){const hp=snapshot?.healthPresentation,summary=$('#p7PositionHealthSummary'),root=$('#p7PositionHealth'),providers=$('#p7Providers');";
  const healthPatch = "function renderPhase7Health(){let hp=snapshot?.healthPresentation;const hh=snapshot?.health;if(hp&&hh&&!p7HealthPresentationMatches(hp,hh))hp=null;const summary=$('#p7PositionHealthSummary'),root=$('#p7PositionHealth'),providers=$('#p7Providers');";
  html = replaceOnce(html, healthNeedle, healthPatch, 'health presentation freshness guard');

  const scriptNeedle = "const today=new Date(),iso=d=>";
  const syncHelpers = `
let p7HealthRefreshTimer=null;
function p7HealthPresentationMatches(hp,h){const b=hp?.basis||{};if(Number.isFinite(h?.healthSequence)&&Number.isFinite(b.healthSequence))return h.healthSequence===b.healthSequence;if(Number.isFinite(h?.receivedAt)&&Number.isFinite(b.receivedAt))return h.receivedAt===b.receivedAt;return true}
function p7ScheduleNormalizedStateRefresh(){if(!currentDevice)return;const id=currentDevice;if(p7HealthRefreshTimer)clearTimeout(p7HealthRefreshTimer);p7HealthRefreshTimer=setTimeout(()=>{p7HealthRefreshTimer=null;if(currentDevice===id)refreshPhase5State(id)},120)}
const p7BaseWsMessage=wsMessage;wsMessage=m=>{if(m?.type==='health'&&snapshot)snapshot.healthPresentation=null;p7BaseWsMessage(m);if(m?.type==='health'||m?.type==='snapshot')p7ScheduleNormalizedStateRefresh()};
`;
  html = replaceOnce(html, scriptNeedle, syncHelpers + scriptNeedle, 'WebSocket health refresh sync');
  return html;
}
