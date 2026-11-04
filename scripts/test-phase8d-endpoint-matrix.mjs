// Phase 8D.2: fail-closed CSV schema/route-uniqueness audit; no live Cloudflare claims.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const path = "audit/phase8d/PHASE8D_ENDPOINT_MATRIX_V2.csv";
const rows = readFileSync(path, "utf8").trim().split(/\r?\n/).filter(line => line.trim() && !line.startsWith("#"));
function parse(line) {
  const fields = [];
  let field = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (c === "," && !quoted) { fields.push(field); field = ""; }
    else field += c;
  }
  assert.equal(quoted, false, "unterminated CSV string");
  fields.push(field);
  return fields;
}
const expected = [
  "method", "pattern", "source_layer", "auth_intent_source", "storage_or_side_effect_unverified",
  "source_evidence_level", "input_contract", "output_contract", "rate_limit", "logging_policy",
  "retest_evidence", "verification_status"
];
assert.deepEqual(parse(rows[0]), expected, "Endpoint CSV columns missing or shifted");
assert.equal(rows.length - 1, 49, "49 existing endpoint candidates must remain represented");
const visited = new Set();
for (const [index, line] of rows.entries()) {
  if (index === 0) continue;
  const values = parse(line);
  assert.equal(values.length, expected.length, "CSV route " + index + " has wrong field count");
  assert.ok(values.every(value => value.trim().length > 0), "CSV route " + index + " contains blank field");
  const key = values[0] + " " + values[1];
  assert.equal(visited.has(key), false, "duplicate route " + key);
  visited.add(key);
  assert.match(values[11], /^(SOURCE-CANDIDATE ONLY|SOURCE\/CI PARTIAL — LIVE PENDING)$/,
    "Unrecognized route verification status: " + key);
}
console.log("PASS P8D-012: 49 candidate routes, 12 named CSV fields, unique route keys, explicit unverified statuses");
