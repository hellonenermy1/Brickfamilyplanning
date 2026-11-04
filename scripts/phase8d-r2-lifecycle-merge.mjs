// Pure fail-closed Cloudflare R2 lifecycle merge for Brick V1 8D.17.
// Never replaces unrelated user-managed bucket rules.
export function mergeR2LifecycleRules(current, desired) {
  if (!Array.isArray(current) || !Array.isArray(desired) || desired.length === 0)
    throw new Error("R2 lifecycle response or Brick target rules invalid");
  const byId = new Map(), reserved = new Set(desired.map(r => r.id));
  if (reserved.size !== desired.length) throw new Error("duplicate Brick R2 lifecycle IDs");
  const desiredPrefixes = desired.filter(r => r.deleteObjectsTransition).map(r => r.conditions?.prefix);
  for (const rule of current) {
    if (!rule || typeof rule.id !== "string" || !rule.id || typeof rule.conditions?.prefix !== "string")
      throw new Error("unexpected existing R2 lifecycle rule schema");
    if (byId.has(rule.id)) throw new Error("duplicate existing R2 lifecycle ID");
    if (!reserved.has(rule.id) && rule.deleteObjectsTransition) {
      const prefix = rule.conditions.prefix;
      if (desiredPrefixes.some(wanted => prefix === "" || wanted.startsWith(prefix) || prefix.startsWith(wanted)))
        throw new Error("unmanaged R2 expiration rule overlaps Brick raw/trusted/evidence retention");
    }
    byId.set(rule.id, rule);
  }
  for (const rule of desired) byId.set(rule.id, rule);
  if (byId.size > 1000) throw new Error("Cloudflare R2 lifecycle rule limit exceeded");
  return [...byId.values()];
}
