#!/usr/bin/env node
// Deterministic, NON-MUTATING Phase 8D remediation planning from a sanitized
// Cloudflare metadata audit report. Never reads credentials or Cloudflare user data.
import fs from "node:fs";

const ACTIONS={
 production_deployment:{section:"8D.1/19",priority:"P1",action:"Read active production version metadata and immutable source provenance; compare with audited release SHA. If untagged, mark provenance UNKNOWN, not corrupt.",gate:"No production release until final 8D PASS and validated rollback."},
 development_deployment:{section:"8D.1",priority:"P2",action:"Identify development active version and source provenance without changing user-facing deployment.",gate:"Keep production and development identity independent."},
 production_bindings:{section:"8D.1/6/9/14",priority:"P1",action:"Reconcile deployed Worker DB, DO, HISTORY, MAPS, EVENTS, PARENT_HISTORY_RATE, PARENT_WS_RATE, PARENT_GEOCODE_RATE and PARENT_COMMUTE_RATE against wrangler.template.jsonc; provision isolated dependencies first. Missing production Queue/R2 bindings could cause hard 503 on the new worker.",gate:"No blind Worker deploy; prove live D1/R2/Queue readiness and rollback in isolated rehearsal."},
 development_isolation:{section:"8D.1/11/14",priority:"P2",action:"Add missing PARENT_GEOCODE_RATE and PARENT_COMMUTE_RATE using complete development Wrangler config only after comparing actual D1 binding and signed dev environment.",gate:"Never share production D1 or Queue; redeploy dev only with isolated validation."},
 queue_dlq:{section:"8D.6/9/18",priority:"P1",action:"Inspect full account Queue inventory and names. If truly absent, create brick-family-v1-events and brick-family-v1-dlq via approved resource provisioning; configure producer, consumer, retries, dead-letter and isolation.",gate:"Test R2 history write, poison, retry, duplicate and DLQ on isolated Cloudflare before production binding."},
 history_lifecycle:{section:"8D.16/17",priority:"P1",action:"Grant the audit token Account Workers R2 Storage Read (do not grant write). Verify real HISTORY/MAPS buckets and scoped 30/90-day lifecycle plus multipart abort; preserve unrelated rules.",gate:"No retention mutation or destructive restore without isolated object inventory and lossless backup."},
 parent_access:{section:"8D.10/11/12",priority:"P1",action:"Grant the audit token Account Access: Apps and Policies Read (do not grant write). Verify exact /parent* application, policy, audience, issuer and real parent authorization before deploy.",gate:"No public parent API or WS rollout without live denial/isolation tests."}
};
const order=["history_lifecycle","parent_access","production_deployment","development_deployment","production_bindings","development_isolation","queue_dlq"];
export function planFromAudit(report) {
 if(!report||!Array.isArray(report.checks)||report.checks.length!==7)throw Error("Invalid incomplete Phase 8D attestation; cannot plan changes");
 const seen=new Set(),steps=[];
 for(const item of report.checks){
  if(typeof item?.name!=="string"||!ACTIONS[item.name]||seen.has(item.name))throw Error("Duplicate/unknown audit item");
  if(!["ATTESTED","DRIFT","BLOCKED"].includes(item.status))throw Error("Unknown result status");
  seen.add(item.name);
 }
 if(order.some(x=>!seen.has(x)))throw Error("Missing mandatory audit item");
 for(const name of order){
  const actual=report.checks.find(x=>x.name===name),spec=ACTIONS[name];
  steps.push({id:name,section:spec.section,priority:spec.priority,status:actual.status,
    nextAction:actual.status==="ATTESTED"?"No configuration remediation; maintain verification evidence.":spec.action,
    safetyGate:spec.gate});
 }
 const statuses=Object.fromEntries(steps.map(x=>[x.id,x.status]));
 return {format:"brick-phase8d-remediation-plan-v1",phase8d:"IN_PROGRESS_NOT_PASS",
  sourceAuditTrustedAsLiveProof:false,automaticMutationAllowed:false,
  counts:{attested:steps.filter(x=>x.status==="ATTESTED").length,
   drift:steps.filter(x=>x.status==="DRIFT").length,blocked:steps.filter(x=>x.status==="BLOCKED").length},
  liveReadyForRelease:false,steps,summary:statuses};
}
if(process.argv[1]&&process.argv[1].endsWith("phase8d-remediation-plan.mjs")){
 const input=process.argv[2]||"phase8d-live-readonly-result.json";
 const report=JSON.parse(fs.readFileSync(input,"utf8"));
 const plan=planFromAudit(report);
 const json=JSON.stringify(plan,null,2)+"\n";
 fs.writeFileSync("phase8d-remediation-plan.json",json,{mode:0o600});
 console.log("Generated NON-MUTATING remediation plan: "+plan.counts.drift+" config drifts, "+plan.counts.blocked+" blocked checks; no Cloudflare changes performed.");
 if(plan.counts.drift||plan.counts.blocked)process.exitCode=2;
}
