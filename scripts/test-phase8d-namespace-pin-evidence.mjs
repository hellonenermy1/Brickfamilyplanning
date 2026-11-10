// Offline evidence integrity guard. Never requires Cloudflare credentials, network access or raw namespace IDs.
// Confirms an independently supplied digest matches the previously observed digest;
// it MUST NOT turn that match into a live metadata, recovery or operational PASS.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const historical=JSON.parse(fs.readFileSync('audit/phase8d/PHASE8D_GROUP1_HISTORICAL_PITR_EVIDENCE.json','utf8'));
const attestation=JSON.parse(fs.readFileSync('audit/phase8d/PHASE8D_GROUP1_NAMESPACE_PIN_EVIDENCE.json','utf8'));
const receipt=fs.readFileSync('audit/phase8d/PHASE8D_GROUP1_NAMESPACE_INDEPENDENT_PINS_2026-11-10.md','utf8');
const sha256=/^[0-9a-f]{64}$/;
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS '+name);}
function rejectTamper(name,mutate){const bad=structuredClone(attestation);mutate(bad);assert.throws(()=>validate(bad,historical,receipt),undefined,name);passed++;console.log('PASS reject '+name);}

function validate(a,h,doc){
 assert.equal(a.format,'brick-phase8d-group1-independent-namespace-pin-attestation-v1');
 assert.equal(a.recordedOn,'2026-11-10');
 assert.equal(a.referenceEvidence,'audit/phase8d/PHASE8D_GROUP1_HISTORICAL_PITR_EVIDENCE.json');
 assert.equal(a.sourceNamespaceValuesStored,false);
 assert.equal(a.liveMetadataWithExpectedPinsRun,false);
 assert.equal(a.verifiedScope,'INDEPENDENT_HASH_COMPARISON_ONLY');
 assert.equal(a.readiness,'NOT_READY');assert.equal(a.phase8dStatus,'NOT_PASS');
 assert.equal(a.cloudWritesPerformed,false);assert.equal(a.applicationDeployed,false);
 assert.equal(h.status,'HISTORICAL_AND_CURRENT_BOOKMARKS_OBSERVED_EXPECTED_DO_PINS_REQUIRED');
 assert.equal(h.workflow.metadataJobConclusion,'failure');assert.equal(h.workflow.cliExitCode,2);
 assert.equal(h.workflow.overallConclusion,'failure');
 assert.equal(h.observedResult.metadataReadCompleted,true);
 assert.equal(h.observedResult.checksPassed,false);
 assert.equal(h.observedResult.activeVersionBindingMetadataVerified,false);
 assert.equal(h.observedResult.operationalRecoveryProven,false);
 assert.equal(h.observedResult.installedWriterCoverageProven,false);
 assert.equal(h.observedResult.independentCustodyProven,false);
 assert.equal(h.observedResult.credentialLeastPrivilegeProven,false);
 assert.equal(h.observedResult.pitr.checksPassed,true);
 assert.equal(h.observedResult.pitr.recoveryProven,false);
 assert.equal(h.observedResult.pitr.retentionWindowVerified,false);
 assert.equal(h.observedResult.requestsMade,11);
 assert.equal(h.observedResult.checks.at(-1)?.code,'DO_NAMESPACE_PINS_REQUIRED');
 assert.equal(h.historicalTarget.automaticObservedNamespacePromotion,false);
 assert.equal(h.cloudWritesPerformed,false);assert.equal(h.applicationDeployed,false);
 assert.equal(h.group1Status,'NOT_READY');assert.equal(h.phase8dStatus,'NOT_PASS');
 assert.equal(a.namespacePins.length,2);
 const expected=[
  ['BrickDevice','BRICK_DEVICE','deviceNamespaceSha256'],
  ['BetaScheduler','BETA_SCHEDULER','schedulerNamespaceSha256']
 ];
 const hashes=new Set();
 for(let i=0;i<expected.length;i++){
  const p=a.namespacePins[i], [className,binding,field]=expected[i];
  assert.deepEqual(Object.keys(p).sort(),['worker','className','binding','idFormat','independentlySuppliedSha256','observedEvidenceField','match'].sort());
  assert.equal(p.worker,'brick-family-beta');assert.equal(p.className,className);assert.equal(p.binding,binding);
  assert.equal(p.idFormat,'hex32');assert.equal(p.observedEvidenceField,field);assert.equal(p.match,'MATCH');
  assert.match(p.independentlySuppliedSha256,sha256);
  assert.equal(p.independentlySuppliedSha256,h.observedResult.active[field]);
  assert.ok(doc.includes(p.independentlySuppliedSha256));
  hashes.add(p.independentlySuppliedSha256);
 }
 assert.equal(hashes.size,2);
 assert.ok(doc.includes('LIVE_METADATA_WITH_EXPECTED_PINS=NOT_RUN_IN_THIS_BATCH'));
 assert.ok(doc.includes('NAMESPACE_INDEPENDENT_HASH_MATCH=PASS'));
 // No plaintext namespace IDs in this public JSON receipt.
 for (const p of a.namespacePins) assert.equal(Object.hasOwn(p,'namespaceId'),false);
}
check('pre-existing failed workflow remains failed',()=>validate(attestation,historical,receipt));
rejectTamper('different independently supplied ID hash',a=>a.namespacePins[0].independentlySuppliedSha256='0'.repeat(64));
rejectTamper('swapped bindings',a=>a.namespacePins[0].binding='BETA_SCHEDULER');
rejectTamper('swapped classes',a=>a.namespacePins[1].className='BrickDevice');
rejectTamper('swapped observed field',a=>a.namespacePins[1].observedEvidenceField='deviceNamespaceSha256');
rejectTamper('missing class record',a=>a.namespacePins.pop());
rejectTamper('duplicated ID hash',a=>a.namespacePins[1].independentlySuppliedSha256=a.namespacePins[0].independentlySuppliedSha256);
rejectTamper('invalid digest format',a=>a.namespacePins[0].independentlySuppliedSha256='not-a-digest');
rejectTamper('stored raw ID field',a=>a.namespacePins[0].namespaceId='nope');
rejectTamper('claim live metadata pass without live run',a=>a.liveMetadataWithExpectedPinsRun=true);
rejectTamper('claim operational readiness',a=>a.readiness='READY');
rejectTamper('claim phase 8D passed',a=>a.phase8dStatus='PASS');
rejectTamper('claim cloud writes',a=>a.cloudWritesPerformed=true);
rejectTamper('claim deployment',a=>a.applicationDeployed=true);
rejectTamper('claim broader proof scope',a=>a.verifiedScope='CLOUD_RESTORE_VERIFIED');
const changedHistorical=structuredClone(historical);
changedHistorical.observedResult.checksPassed=true;
assert.throws(()=>validate(attestation,changedHistorical,receipt));passed++;console.log('PASS reject retroactive metadata success');
console.log(JSON.stringify({suite:'phase8d-independent-namespace-pin-evidence',passed,failed:0,scope:'offline SHA-256 comparison to pre-existing cloud observation; no live GET, restore, installation or operational acceptance'}));
