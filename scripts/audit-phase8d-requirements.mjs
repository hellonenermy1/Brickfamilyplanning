// Inventory and navigation, not automatic feature acceptance or an owner assignment.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {BASELINE_PATH,BASELINE_SHA256,LEDGER_PATH,canonicalRequirements,requirementDigest,draftSummary,hash,verifyRequirementsForRelease} from './phase8d-requirements-ledger.mjs';
const FINDINGS='audit/phase8d/PHASE8D_FINDINGS.md';
const allowedStatuses=new Set(['NOT STARTED','IMPLEMENTED','UNIT/CI VERIFIED','INTEGRATION VERIFIED','DEVICE VERIFIED','ACCEPTED','OPEN BLOCKER','VERIFIED UNSUPPORTED']);
function requireValue(ok,message){if(!ok)throw Error('Phase8D requirement inventory refused: '+message);}
export function draftLedger(baseline,findings){
 const mentions=new Map(baseline.map(row=>[row.requirement_id,new Set()]));
 for(const block of findings.split(/\n(?=## )/)){
  const finding=block.split('\n',1)[0].match(/^## (P8D-\d{3})\b/)?.[1];
  if(!finding)continue;
  for(const id of block.match(/\b[A-Z][A-Z0-9]*-\d{3}\b/g)??[])if(mentions.has(id))mentions.get(id).add(finding);
 }
 return {format:'brick-phase8d-requirement-ledger-v1',repository:'hellonenermy1/Brickfamilyplanning',
  baseline:{path:BASELINE_PATH,sha256:BASELINE_SHA256},reviewedSourceSha:null,
  sourceEvidenceCheckpoint:'58285064fbf3d6b707dd15d8ef2fd3fb967ae47d',
  notice:'DRAFT: per-ID audit acceptance remains OPEN BLOCKER. Candidate finding references are navigation, not proof. Null owners/reviews and unresolved scope are deliberate gaps, not assignments or exclusions.',
  candidateFindingsPath:FINDINGS,
  requirements:baseline.map(row=>({id:row.requirement_id,title:row.title,classification:row.classification,profile:row.profile,requirementSha256:requirementDigest(row),scope:'UNRECONCILED',disposition:'UNRECONCILED',scopeReview:null,scopeReason:'Per-ID phase applicability and appropriate evidence have not yet been reviewed; no exclusion is asserted.',sections:[],status:'OPEN BLOCKER',implementationOwner:null,testOwner:null,review:null,criteria:{C1:'NOT REVIEWED',C2:'NOT REVIEWED',C3:'NOT REVIEWED',C4:'NOT REVIEWED'},severity:'UNASSESSED',blockerReason:'Per-ID acceptance evidence, ownership and reviewed disposition remain incomplete.',remediation:'Review applicability and appropriate criteria/evidence, assign owners, assess actual findings and resolve applicable blockers.',evidence:[],candidateFindings:[...mentions.get(row.requirement_id)].sort()}))};
}
export function inspectInventory(ledger,baseline){
 requireValue(ledger?.format==='brick-phase8d-requirement-ledger-v1'&&ledger.repository==='hellonenermy1/Brickfamilyplanning','format/repository');
 requireValue(ledger.baseline?.path===BASELINE_PATH&&ledger.baseline.sha256===BASELINE_SHA256,'baseline identity');
 requireValue(Array.isArray(ledger.requirements)&&ledger.requirements.length===525,'all525 rows');
 const expected=new Map(baseline.map(row=>[row.requirement_id,row])),seen=new Set();
 for(const row of ledger.requirements){
  requireValue(expected.has(row.id)&&!seen.has(row.id),'unknown/duplicate ID');seen.add(row.id);
  const original=expected.get(row.id);
  requireValue(row.title===original.title&&row.classification===original.classification&&row.profile===original.profile&&row.requirementSha256===requirementDigest(original),'canonical drift '+row.id);
  requireValue(allowedStatuses.has(row.status),'invalid status '+row.id);
  requireValue(['UNRECONCILED','VERIFIED_FOR_8D','CARRIED_FORWARD','DEFERRED'].includes(row.disposition),'invalid disposition '+row.id);
  requireValue(row.criteria&&['C1','C2','C3','C4'].every(k=>typeof row.criteria[k]==='string'||row.criteria[k]!==null&&typeof row.criteria[k]==='object'&&!Array.isArray(row.criteria[k]))&&typeof row.blockerReason==='string'&&typeof row.remediation==='string'&&typeof row.severity==='string','missing audit worksheet fields '+row.id);
  requireValue(['UNRECONCILED','PHASE8D','CROSS_PHASE'].includes(row.scope),'invalid scope '+row.id);
  requireValue(Array.isArray(row.sections)&&row.sections.every(x=>/^8D\.([1-9]|1[0-9])$/.test(x))&&new Set(row.sections).size===row.sections.length,'invalid sections '+row.id);
  requireValue(Array.isArray(row.evidence)&&Array.isArray(row.candidateFindings)&&row.candidateFindings.every(x=>/^P8D-\d{3}$/.test(x)),'invalid evidence/navigation arrays '+row.id);
 }
 return draftSummary(ledger);
}
export function encodeLedger(ledger){
 // Keep one complete row per line for reviewable diffs without repeating the canonical text.
 const {requirements,...metadata}=ledger;
 return JSON.stringify(metadata,null,2).slice(0,-2)+',\n  "requirements": [\n'+requirements.map(row=>'    '+JSON.stringify(row)).join(',\n')+'\n  ]\n}\n';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const baseline=canonicalRequirements(fs.readFileSync(BASELINE_PATH));
 if(process.argv.includes('--initialize')){
  requireValue(!fs.existsSync(LEDGER_PATH),'existing ledger will not be overwritten; review/update it explicitly');
  const ledger=draftLedger(baseline,fs.readFileSync(FINDINGS,'utf8'));inspectInventory(ledger,baseline);
  fs.mkdirSync(path.dirname(LEDGER_PATH),{recursive:true});fs.writeFileSync(LEDGER_PATH,encodeLedger(ledger));
 }
 const raw=fs.readFileSync(LEDGER_PATH),ledger=JSON.parse(raw),summary=inspectInventory(ledger,baseline);
 const findings=fs.readFileSync(FINDINGS,'utf8'),mentions=new Map();
 for(const block of findings.split(/\n(?=## )/)){
  const id=block.split('\n',1)[0].match(/^## (P8D-\d{3})\b/)?.[1];
  if(id){if(!mentions.has(id))mentions.set(id,new Set());for(const reference of block.match(/\b[A-Z][A-Z0-9]*-\d{3}\b/g)??[])mentions.get(id).add(reference);}
 }
 for(const row of ledger.requirements){
  for(const finding of row.candidateFindings)requireValue(mentions.get(finding)?.has(row.id),'candidate finding does not reference '+row.id);
  for(const evidence of row.evidence){
   requireValue(typeof evidence.path==='string'&&/^audit\/phase8d\/[A-Za-z0-9_./-]+$/.test(evidence.path)&&evidence.path.split('/').every(x=>x&&x!=='.'&&x!=='..'),'unsafe recorded evidence path');
   requireValue(hash(fs.readFileSync(evidence.path))===evidence.sha256,'recorded evidence hash drift '+row.id);
  }
 }
 console.log('PASS inventory structure only: '+JSON.stringify(summary));
 console.log('OPEN acceptance: inventory integrity and candidate references do not close scope/owner/evidence gaps or qualify release');
 if(process.argv.includes('--require-accepted')){
  const result=await verifyRequirementsForRelease({total:525,unmapped:0,unverifiedApplicable:0,ledger:{path:LEDGER_PATH,sha256:hash(raw)}},{readTrackedFile:p=>fs.readFileSync(p)},ledger.reviewedSourceSha??'UNREVIEWED');
  console.log(JSON.stringify(result));
 }
}
