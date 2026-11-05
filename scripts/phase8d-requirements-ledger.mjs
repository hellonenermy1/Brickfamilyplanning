// Structural provenance only. A reviewer must assess whether each evidence item proves its claim.
import crypto from 'node:crypto';
export const BASELINE_PATH='audit/phase8c/PHASE8C_RECOVERED_525_REQUIREMENTS.csv';
export const BASELINE_SHA256='1c435a1b481a27457a5848637160d40cab0620ef123f1a5c40d601e1ef913228';
export const LEDGER_PATH='audit/phase8d/release-evidence/PHASE8D_REQUIREMENTS_LEDGER.json';
export const BASELINE_FIELDS=['requirement_id','classification','profile','title','current_requirement','authority_status','authoritative_source'];
export const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const refuse=(ok,why)=>{if(!ok)throw Error('Phase8D release refused: requirement ledger '+why);};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const section=id=>typeof id==='string'&&/^8D\.([1-9]|1[0-9])$/.test(id);
const owner=v=>typeof v==='string'&&v.trim().length>=3&&!/^(?:unassigned|unknown|pending|tbd|todo|n\/?a|none|null)(?:\b|$)/i.test(v.trim());
const evidencePath=p=>typeof p==='string'&&/^audit\/phase8d\/[A-Za-z0-9_./-]+$/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');
const kinds=new Set(['SOURCE_CI','LOCAL_INTEGRATION','LIVE_INTEGRATION','DEVICE','SCOPE_REVIEW','PROHIBITION_REVIEW','FUTURE_INTERFACE_REVIEW','UNSUPPORTED_PROOF']);
// RFC4180 fields, including quoted commas/newlines and doubled quotes; no split(',') parsing.
export function parseCsv(text){
 const rows=[];let row=[],field='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
  if(c===','||c==='\n'||c==='\r'){
   row.push(field);field='';closed=false;
   if(c!==','){rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}
  }else if(c==='"'){refuse(!closed&&!field,'malformed CSV quote');quoted=true;}
  else{refuse(!closed,'text after CSV closing quote');field+=c;}
 }
 refuse(!quoted,'unterminated CSV quote');
 if(row.length||field||closed){row.push(field);rows.push(row);}
 return rows;
}
export function canonicalRequirements(bytes){
 refuse(hash(bytes)===BASELINE_SHA256,'canonical baseline hash mismatch');
 const [header,...rows]=parseCsv(Buffer.from(bytes).toString('utf8'));
 refuse(JSON.stringify(header)===JSON.stringify(BASELINE_FIELDS),'canonical baseline columns mismatch');
 refuse(rows.length===525&&rows.every(r=>r.length===header.length),'canonical baseline inventory mismatch');
 const records=rows.map(row=>Object.fromEntries(header.map((key,i)=>[key,row[i]])));
 refuse(new Set(records.map(x=>x.requirement_id)).size===525,'canonical baseline duplicate IDs');
 return records;
}
export const requirementDigest=row=>hash(JSON.stringify(BASELINE_FIELDS.map(key=>row[key])));
export function draftSummary(ledger){
 const rows=ledger.requirements;
 return {total:rows.length,unmapped:rows.filter(x=>!['PHASE8D','CROSS_PHASE'].includes(x.scope)).length,
  unverifiedTotal:rows.filter(x=>!['ACCEPTED','VERIFIED UNSUPPORTED'].includes(x.status)).length,
  unassignedOwners:rows.filter(x=>!owner(x.implementationOwner)||!owner(x.testOwner)).length,
  unresolvedDispositions:rows.filter(x=>!['VERIFIED_FOR_8D','CARRIED_FORWARD','DEFERRED'].includes(x.disposition)).length,phase8dScope:rows.filter(x=>x.scope==='PHASE8D').length,crossPhaseScope:rows.filter(x=>x.scope==='CROSS_PHASE').length,
  withCandidateFindings:rows.filter(x=>x.candidateFindings?.length).length,
  withRecordedEvidence:rows.filter(x=>x.evidence?.length).length,unreviewedAcceptance:rows.filter(x=>!x.review).length};
}
export async function verifyRequirementsForRelease(claim,ctx,testedSourceSha){
 refuse(object(claim)&&object(claim.ledger),'descriptor absent');
 const descriptor=claim.ledger;
 refuse(evidencePath(descriptor.path)&&descriptor.path.startsWith('audit/phase8d/release-evidence/')&&descriptor.path.endsWith('.json')&&/^[a-f0-9]{64}$/.test(descriptor.sha256??''),'invalid descriptor path/hash');
 const cache=new Map();
 async function tracked(p){if(!cache.has(p))cache.set(p,Promise.resolve().then(()=>ctx.readTrackedFile(p)).catch(()=>refuse(false,'tracked proof unavailable')));return cache.get(p);}
 const raw=await tracked(descriptor.path);
 refuse(Buffer.byteLength(raw)<=8*1024*1024&&hash(raw)===descriptor.sha256,'document hash/size mismatch');
 let ledger;try{ledger=JSON.parse(Buffer.from(raw).toString('utf8'));}catch{refuse(false,'invalid JSON');}
 refuse(ledger?.format==='brick-phase8d-requirement-ledger-v1'&&ledger.repository==='hellonenermy1/Brickfamilyplanning','wrong format/repository');
 refuse(ledger.reviewedSourceSha===testedSourceSha,'reviewed source SHA mismatch');
 refuse(ledger.baseline?.path===BASELINE_PATH&&ledger.baseline.sha256===BASELINE_SHA256,'wrong baseline descriptor');
 const baseline=canonicalRequirements(await tracked(BASELINE_PATH));
 refuse(Array.isArray(ledger.requirements)&&ledger.requirements.length===baseline.length,'all525 rows required');
 const expected=new Map(baseline.map(row=>[row.requirement_id,row])),seen=new Set();
 let unmapped=0,unverifiedApplicable=0,deferredCrossPhase=0,carriedForward=0;
 for(const item of ledger.requirements){
  refuse(object(item)&&expected.has(item.id)&&!seen.has(item.id),'unknown/duplicate requirement ID');seen.add(item.id);
  const canonical=expected.get(item.id);
  refuse(item.classification===canonical.classification&&item.profile===canonical.profile&&item.title===canonical.title&&item.requirementSha256===requirementDigest(canonical),'changed canonical requirement '+item.id);
  if(!['PHASE8D','CROSS_PHASE'].includes(item.scope))unmapped++;
  refuse(typeof item.scopeReason==='string'&&item.scopeReason.trim().length>=20,'scope rationale missing '+item.id);
  refuse(Array.isArray(item.sections)&&item.sections.every(section)&&new Set(item.sections).size===item.sections.length,'invalid sections '+item.id);
  refuse(item.scope!=='PHASE8D'||item.sections.length>0,'section mapping missing '+item.id);
  refuse(owner(item.implementationOwner)&&owner(item.testOwner),'implementation/test owner unassigned '+item.id);
  refuse(object(item.review)&&owner(item.review.reviewer)&&typeof item.review.reviewedAt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(item.review.reviewedAt)&&Number.isFinite(Date.parse(item.review.reviewedAt)),'review absent '+item.id);
  const accepted=item.status==='ACCEPTED',unsupported=item.status==='VERIFIED UNSUPPORTED';
  let deferred=false;
  if(item.scope==='PHASE8D'){
   refuse(item.disposition==='VERIFIED_FOR_8D','current-phase disposition missing '+item.id);
   if(!accepted&&!unsupported)unverifiedApplicable++;
  }else if(item.scope==='CROSS_PHASE'){
   if(item.disposition==='CARRIED_FORWARD'){
    refuse(['8A','8B','8C'].includes(item.carriedFromPhase)&&(accepted||unsupported),'invalid carry-forward '+item.id);carriedForward++;
   }else if(item.disposition==='DEFERRED'){
    refuse(['8E','8F','9'].includes(item.targetPhase)&&['NOT STARTED','IMPLEMENTED','UNIT/CI VERIFIED','INTEGRATION VERIFIED','DEVICE VERIFIED'].includes(item.status)&&item.blockingPhase8D===false&&typeof item.deferredReason==='string'&&item.deferredReason.trim().length>=20,'invalid future-phase deferral '+item.id);deferred=true;deferredCrossPhase++;
   }else refuse(false,'cross-phase disposition missing '+item.id);
  }
  if(unsupported)refuse(item.classification==='OPTIONAL-IF-SUPPORTED'&&typeof item.reason==='string'&&item.reason.trim().length>=20,'unsupported not justified/permitted '+item.id);
  refuse(Array.isArray(item.evidence)&&item.evidence.length>0&&item.evidence.length<=32,'evidence missing/unbounded '+item.id);
  const itemKinds=new Set();
  for(const evidence of item.evidence){
   refuse(object(evidence)&&kinds.has(evidence.kind)&&evidencePath(evidence.path)&&/^[a-f0-9]{64}$/.test(evidence.sha256??''),'invalid evidence '+item.id);
   refuse(evidence.path!==descriptor.path&&!/^audit\/phase8d\/PHASE8D_FINAL_ACCEPTANCE\.(json|md)$/.test(evidence.path),'circular acceptance evidence '+item.id);
   refuse(hash(await tracked(evidence.path))===evidence.sha256,'evidence hash mismatch '+item.id);itemKinds.add(evidence.kind);
  }
  if(item.scope==='CROSS_PHASE')refuse(itemKinds.has('SCOPE_REVIEW')&&(deferred||[...itemKinds].some(k=>k!=='SCOPE_REVIEW')),'cross-phase scope/carry-forward proof missing '+item.id);
  if(unsupported)refuse(itemKinds.has('UNSUPPORTED_PROOF'),'unsupported proof missing '+item.id);
  if(!deferred&&item.classification==='FORBIDDEN')refuse(accepted&&itemKinds.has('PROHIBITION_REVIEW'),'prohibition proof missing '+item.id);
  if(!deferred&&item.classification==='FUTURE-INTERFACE')refuse(accepted&&itemKinds.has('FUTURE_INTERFACE_REVIEW'),'future-interface proof missing '+item.id);
 }
 refuse(seen.size===525&&unmapped===0&&unverifiedApplicable===0,'unmapped/unverified dispositions');
 refuse(claim.total===seen.size&&claim.unmapped===unmapped&&claim.unverifiedApplicable===unverifiedApplicable&&(claim.deferredCrossPhase??0)===deferredCrossPhase&&(claim.carriedForward??0)===carriedForward,'claimed totals differ from actual ledger');
 return {total:seen.size,unmapped,unverifiedApplicable,deferredCrossPhase,carriedForward,ledgerSha256:descriptor.sha256};
}
