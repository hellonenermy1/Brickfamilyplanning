// Structural review provenance only. This does not authenticate a reviewer or define C1-C4 semantics.
export const CRITERIA = ['C1', 'C2', 'C3', 'C4'];
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const identity = v => typeof v === 'string' ? v.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase() : '';
const rationale = v => typeof v === 'string' && v.trim().length >= 20 && !/^(?:not reviewed|pending|unknown|tbd|todo|n\/?a|none|null)(?:\b|$)/i.test(v.trim());
const substantive = new Set(['SOURCE_CI', 'LOCAL_INTEGRATION', 'LIVE_INTEGRATION', 'DEVICE', 'PROHIBITION_REVIEW', 'FUTURE_INTERFACE_REVIEW']);
export function worksheetGaps(item, sourceSha) {
  const gaps = [];
  if (!object(item)) return ['ROW_SHAPE'];
  const review = item.review;
  if (!object(review)) gaps.push('REVIEW_ABSENT');
  else {
    const reviewer = identity(review.reviewer);
    if (!reviewer || reviewer === identity(item.implementationOwner) || reviewer === identity(item.testOwner)) gaps.push('REVIEW_NOT_INDEPENDENT');
    if (!/^[a-f0-9]{40}$/.test(sourceSha ?? '') || review.sourceSha !== sourceSha) gaps.push('REVIEW_SOURCE_MISMATCH');
    const date = review.reviewedAt;
    if (typeof date !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString() !== date.replace(/Z$/, date.includes('.') ? 'Z' : '.000Z')) gaps.push('REVIEW_DATE_INVALID');
  }
  if (!object(item.criteria) || Object.keys(item.criteria).sort().join(',') !== CRITERIA.join(',')) return [...gaps, 'CRITERIA_INVENTORY'];
  const deferred = item.scope === 'CROSS_PHASE' && item.disposition === 'DEFERRED';
  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  let passes = 0, unsupported = 0;
  for (const id of CRITERIA) {
    const c = item.criteria[id], fail = code => gaps.push(id + ':' + code);
    if (!object(c)) { fail('UNREVIEWED'); continue; }
    const keys = ['status', 'rationale', 'evidenceRefs', ...(deferred ? ['targetPhase'] : [])];
    if (Object.keys(c).sort().join(',') !== keys.sort().join(',')) fail('FIELDS');
    if (!rationale(c.rationale)) fail('RATIONALE');
    const refs = c.evidenceRefs;
    const validRefs = Array.isArray(refs) && refs.length > 0 && refs.length <= 32 && new Set(refs).size === refs.length && refs.every(i => Number.isSafeInteger(i) && i >= 0 && i < evidence.length && object(evidence[i]));
    if (!validRefs) fail('EVIDENCE_REFS');
    const kinds = new Set(validRefs ? refs.map(i => evidence[i].kind) : []);
    if (deferred) {
      if (c.status !== 'DEFERRED' || c.targetPhase !== item.targetPhase || !['8E', '8F', '9'].includes(c.targetPhase) || !kinds.has('SCOPE_REVIEW')) fail('DEFERRAL');
    } else if (c.status === 'PASS') {
      passes++;
      if (item.status !== 'ACCEPTED' || ![...kinds].some(k => substantive.has(k))) fail('FUNCTIONAL_PROOF');
    } else if (c.status === 'VERIFIED_UNSUPPORTED') {
      unsupported++;
      if (item.status !== 'VERIFIED UNSUPPORTED' || item.classification !== 'OPTIONAL-IF-SUPPORTED' || !kinds.has('UNSUPPORTED_PROOF')) fail('UNSUPPORTED_PROOF');
    } else if (c.status === 'NOT_APPLICABLE') {
      if (!kinds.has('SCOPE_REVIEW')) fail('APPLICABILITY_PROOF');
    } else fail('NONTERMINAL');
  }
  if (!deferred && item.status === 'ACCEPTED' && passes === 0) gaps.push('NO_SATISFIED_CRITERION');
  if (!deferred && item.status === 'VERIFIED UNSUPPORTED' && unsupported === 0) gaps.push('NO_UNSUPPORTED_CRITERION');
  return gaps;
}
