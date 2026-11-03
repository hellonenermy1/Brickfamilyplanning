import fs from 'node:fs';

const src = fs.readFileSync('src/index.ts', 'utf8');
const start = src.indexOf('async function ingestSafetyEvent(req: Request, env: Env, id: string)');
const end = src.indexOf('\nasync function listDevices', start);
if (start < 0 || end <= start) throw new Error('cannot isolate production safety-event ingest path');
const block = src.slice(start, end);

function requireText(text, message) {
  if (!block.includes(text)) throw new Error(message);
}

// Emergency/safety traffic must be durable immediately and independent of the normal location
// history Queue. A multi-day location backlog therefore cannot sit in front of an SOS event.
requireText('INSERT OR IGNORE INTO safety_events', 'safety events must become durable directly in D1');
requireText('.bind(e.eventId, id, e.kind, e.createdAtMs, now,', 'safety storage must preserve device event time separately from server receive time');
requireText('const duplicate = (r.meta.changes ?? 0) === 0;', 'safety ingest must detect duplicate logical event IDs');
requireText('if (!duplicate) {', 'duplicate safety retries must not rebroadcast');
requireText('await stub.pushSafetyEvent(event);', 'new safety events must be pushed directly to live parent state');
requireText('deviceCreatedAt: e.createdAtMs, serverCreatedAt: now', 'parent safety event must preserve device and server times separately');

for (const forbidden of ['env.EVENTS.send(', 'env.EVENTS.sendBatch(', 'processHistoryBatch(', 'queueLocations(']) {
  if (block.includes(forbidden)) throw new Error(`safety ingest must not wait behind normal history queue: found ${forbidden}`);
}

const insertAt = block.indexOf('INSERT OR IGNORE INTO safety_events');
const pushAt = block.indexOf('await stub.pushSafetyEvent(event);');
if (!(insertAt >= 0 && pushAt > insertAt)) throw new Error('SOS/live push must happen only after durable safety insert attempt');

console.log('Phase 8 SOS direct durability, backlog-bypass, time-separation and retry-dedupe contract OK');
