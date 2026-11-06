// Deterministic worksheet gaps, not a count of remaining product tests or a release verdict.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {BASELINE_PATH, LEDGER_PATH, canonicalRequirements, hash} from './phase8d-requirements-ledger.mjs';
import {inspectInventory} from './audit-phase8d-requirements.mjs';
import {CRITERIA, worksheetGaps} from './phase8d-acceptance-worksheet.mjs';
export function closureInventory({baselineBytes, ledgerBytes, sourceSha}) {
  if(!/^[a-f0-9]{40}$/.test(sourceSha??'')) throw Error('Exact source SHA required');
  const baseline=canonicalRequirements(baselineBytes), ledger=JSON.parse(Buffer.from(ledgerBytes).toString('utf8'));
  const summary=inspectInventory(ledger,baseline);
  const requirements=ledger.requirements.map(r=>{
    const gaps=worksheetGaps(r,sourceSha);
    const criterionGaps=Object.fromEntries(CRITERIA.map(id=>[id,gaps.filter(g=>g.startsWith(id+':')).map(g=>g.slice(id.length+1))]));
    return {id:r.id,classification:r.classification,scope:r.scope,sections:r.sections,status:r.status,disposition:r.disposition,
      criteria:r.criteria,evidence:r.evidence,severity:r.severity,blockerReason:r.blockerReason,remediation:r.remediation,
      missingImplementationOwner:r.implementationOwner===null,missingTestOwner:r.testOwner===null,
      recordedEvidence:r.evidence.length,candidateFindingReferences:r.candidateFindings.length,
      reviewGaps:gaps.filter(g=>!CRITERIA.some(id=>g.startsWith(id+':'))),criterionGaps};
  });
  return {format:'brick-phase8d-closure-inventory-v1',sourceSha,baselineSha256:hash(baselineBytes),ledgerSha256:hash(ledgerBytes),reviewedSourceSha:ledger.reviewedSourceSha,
    notice:'Read-only worksheet inventory; evidence references are not functional proof, applicability is not acceptance, missing owners are not assignments. No fixed remaining test total can be derived. Final release status must be decided by the separate acceptance gate and independent review.',
    remainingProductTestCount:null,
    summary:{...summary,criteriaSlots:baseline.length*CRITERIA.length,criteriaSlotsWithGaps:requirements.reduce((n,r)=>n+Object.values(r.criterionGaps).filter(g=>g.length>0).length+(r.reviewGaps.includes('CRITERIA_INVENTORY')?4:0),0),rowsWithWorksheetGaps:requirements.filter(r=>r.reviewGaps.length||Object.values(r.criterionGaps).some(g=>g.length)).length},requirements};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  if(process.argv.length!==3)throw Error('Usage: node scripts/phase8d-closure-inventory.mjs EXACT_SOURCE_SHA');
  console.log(JSON.stringify(closureInventory({baselineBytes:fs.readFileSync(BASELINE_PATH),ledgerBytes:fs.readFileSync(LEDGER_PATH),sourceSha:process.argv[2]}),null,2));
}
