import assert from 'node:assert/strict';
import fs from 'node:fs';

const compat = await import(process.argv[2]);
const guard = await import(process.argv[3]);

const budget = compat.estimatedFreeTierWritesPerDay();
assert.equal(budget.locations, 28800, '3-second worst case should model 28,800 locations/day');
assert.ok(budget.estimatedRowsWritten <= 80000, `worst-case steady-state estimate ${budget.estimatedRowsWritten} must leave >=20% headroom below free D1 cap`);
assert.equal(budget.freeLimit, 100000);

const sample = "UPDATE trips SET x=?1 WHERE id=?12 AND ?11-last_location_at>=?13";
const normalized = guard.normalizePhase5CSql(sample);
assert.ok(!normalized.includes('?13'), 'runtime trip SQL must not require a 13th binding');
assert.ok(normalized.includes('>=60000'), 'trip checkpoint must remain 60 seconds');

const source = fs.readFileSync('src/d1-r2-compat.ts', 'utf8');
assert.match(source, /candidate_state IS NOT NULL OR candidate_count<>0/, 'stable geofence updates must be write-suppressed');
assert.match(source, /if \(!isPacketLatest\(m\.packet, latest\)\) return;/, 'out-of-order packets must not rewind safety state');
assert.match(source, /sequence % SEEN_BLOCK_SIZE === 0/, 'device metadata should checkpoint instead of writing every point');

console.log(`D1 free-tier write budget passed: ~${Math.round(budget.estimatedRowsWritten).toLocaleString()} steady-state rows/day of ${budget.freeLimit.toLocaleString()}`);
