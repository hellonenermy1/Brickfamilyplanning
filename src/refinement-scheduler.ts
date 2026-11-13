// Rotate across active pending devices, including those waiting for endpoints.
// Advancing a cursor is not completion: each selected task has its own receipt.
export async function nextRefinementCandidates(db: D1Database, now = Date.now()) {
  const provider='brick_refinement_scheduler', cacheKey='cursor';
  const prior=await db.prepare('SELECT value_json FROM provider_cache WHERE provider=?1 AND cache_key=?2').bind(provider,cacheKey).first<{value_json:string}>();
  let cursor='';
  try { const value=JSON.parse(prior?.value_json??'null');if(typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value))cursor=value; } catch {}
  async function select(operator: '>' | '<=', limit: number) {
    return (await db.prepare('SELECT DISTINCT f.device_id FROM phase5_hypothesis_frames f JOIN devices d ON d.id=f.device_id '+
      'WHERE f.refined_run_id IS NULL AND d.revoked_at IS NULL AND f.device_id'+operator+'?1 ORDER BY f.device_id LIMIT ?2').bind(cursor,limit).all<{device_id:string}>()).results.map(r=>r.device_id);
  }
  // Receipt/claim overhead is additional to the inherited maintenance work.
  // Keep each invocation small; real fleet/query/CPU budgets still need cloud proof.
  const result=await select('>',4);
  if(cursor&&result.length<4)result.push(...await select('<=',4-result.length));
  if(result.length)await db.prepare('INSERT INTO provider_cache(provider,cache_key,value_json,expires_at,updated_at) VALUES(?1,?2,?3,?4,?5) '+
    'ON CONFLICT(provider,cache_key) DO UPDATE SET value_json=excluded.value_json,expires_at=excluded.expires_at,updated_at=excluded.updated_at')
    .bind(provider,cacheKey,JSON.stringify(result[result.length-1]),now+30*86_400_000,now).run();
  return result;
}
