import type { RealtimeSafetyEvent } from './device-do';
const PROVIDER = 'brick_watchdog_v1', KEY = 'scan', DAY = 86400000;
export const WATCHDOG_PAGE = 8;
type Scan = {
    v: 1;
    at: number;
    water: number;
    cursor: string;
    seen: number;
    complete: boolean;
    failures: number;
    lastCompletedAt: number | null;
};
function decode(text: string): Scan { let s: Scan; try {
    s = JSON.parse(text);
}
catch {
    throw Error('invalid watchdog checkpoint');
} if (!s || Object.keys(s).sort().join(',') !== 'at,complete,cursor,failures,lastCompletedAt,seen,v,water' || s.v !== 1 || !Number.isSafeInteger(s.at) || s.at <= 0 || !Number.isSafeInteger(s.water) || s.water < 0 || typeof s.cursor !== 'string' || s.cursor.length > 128 || !Number.isSafeInteger(s.seen) || s.seen < 0 || typeof s.complete !== 'boolean' || !Number.isSafeInteger(s.failures) || s.failures < 0 || !(s.lastCompletedAt === null || Number.isSafeInteger(s.lastCompletedAt) && s.lastCompletedAt > 0))
    throw Error('invalid watchdog checkpoint'); return s; }
export async function watchdogPage(db: D1Database, work: (id: string) => Promise<unknown>, now = Date.now()) {
    if (!Number.isSafeInteger(now) || now <= 0)
        throw Error('invalid watchdog timestamp');
    const row = await db.prepare('SELECT value_json,expires_at FROM provider_cache WHERE provider=?1 AND cache_key=?2').bind(PROVIDER, KEY).first<{
        value_json: string;
        expires_at: number;
    }>();
    const previous = row?.value_json ?? null, old = row && row.expires_at > now ? decode(row.value_json) : null;
    if (old?.complete && now < old.at + 60000)
        return { complete: true, failed: old.failures > 0, nextDelayMs: Math.max(1000, old.at + 60000 - now) };
    let s = old && !old.complete ? old : null;
    if (!s) {
        const w = await db.prepare('SELECT COALESCE(MAX(rowid),0) n FROM devices').first<{
            n: number;
        }>();
        if (!Number.isSafeInteger(w?.n) || w!.n < 0)
            throw Error('invalid watchdog watermark');
        s = { v: 1, at: now, water: w!.n, cursor: '', seen: 0, complete: false, failures: 0, lastCompletedAt: old?.lastCompletedAt ?? null };
    }
    const rows = (await db.prepare('SELECT id FROM devices WHERE id>?1 AND rowid<=?2 AND revoked_at IS NULL ORDER BY id LIMIT ?3').bind(s.cursor, s.water, WATCHDOG_PAGE + 1).all<{
        id: string;
    }>()).results;
    const page = rows.slice(0, WATCHDOG_PAGE);
    for (const r of page)
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(r.id))
            throw Error('invalid watchdog device identity');
    const results = await Promise.allSettled(page.map(r => work(r.id)));
    s.failures += results.filter(r => r.status === 'rejected' || r.status === 'fulfilled' && r.value === 'PENDING').length;
    s.seen += page.length;
    if (page.length)
        s.cursor = page[page.length - 1].id;
    s.complete = rows.length <= WATCHDOG_PAGE;
    if (s.complete && s.failures === 0)
        s.lastCompletedAt = now;
    const serialized = JSON.stringify(s);
    decode(serialized);
    const saved = await db.prepare('INSERT INTO provider_cache(provider,cache_key,value_json,expires_at,updated_at) SELECT ?1,?2,?3,?4,?5 WHERE ?6 IS NULL OR EXISTS(SELECT 1 FROM provider_cache WHERE provider=?1 AND cache_key=?2 AND value_json=?6) ON CONFLICT(provider,cache_key) DO UPDATE SET value_json=excluded.value_json,expires_at=excluded.expires_at,updated_at=excluded.updated_at WHERE provider_cache.value_json=?6').bind(PROVIDER, KEY, serialized, now + 3 * DAY, now, previous).run();
    if (Number(saved.meta.changes) !== 1)
        throw Error('watchdog checkpoint ownership changed');
    return { complete: s.complete, failed: s.failures > 0, nextDelayMs: s.complete ? Math.max(1000, s.at + 60000 - now) : 1000 };
}
export async function watchdogStatus(db: D1Database) { const row = await db.prepare('SELECT value_json FROM provider_cache WHERE provider=?1 AND cache_key=?2 AND expires_at>?3').bind(PROVIDER, KEY, Date.now()).first<{
    value_json: string;
}>(); if (!row)
    return { task: 'watchdog-scan', status: 'NOT_RUN' }; const s = decode(row.value_json); return { task: 'watchdog-scan', status: s.failures ? 'FAILED' : s.complete ? 'COMPLETED' : 'PENDING', checkedDevices: s.seen, cycleStartedAt: s.at, lastSuccessAt: s.lastCompletedAt, overdue: !s.complete && Date.now() - s.at > 60000 }; }
export async function checkWatchdogDevice(db: D1Database, deviceId: string, push: (event: RealtimeSafetyEvent) => Promise<boolean>, now = Date.now()) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(deviceId) || !Number.isSafeInteger(now) || now <= 0)
        throw Error('invalid watchdog input');
    const device = await db.prepare('SELECT created_at,last_health_at FROM devices WHERE id=?1 AND revoked_at IS NULL').bind(deviceId).first<{
        created_at: number;
        last_health_at: number | null;
    }>();
    if (!device)
        return { complete: true };
    const last = device.last_health_at ?? device.created_at;
    if (!Number.isSafeInteger(last) || last < 0)
        throw Error('invalid watchdog heartbeat');
    const observed = "EXISTS(SELECT 1 FROM devices WHERE id=?1 AND revoked_at IS NULL AND created_at=?2 AND last_health_at IS ?3)";
    if (now - last >= 90000) {
        const open = await db.prepare("SELECT id,kind FROM health_incidents WHERE device_id=?1 AND ended_at IS NULL AND kind<>'backend_processing_failed' ORDER BY started_at DESC,id LIMIT 1").bind(deviceId).first<{
            id: string;
            kind: string;
        }>();
        if (open?.kind === 'device_offline')
            await db.prepare('UPDATE health_incidents SET last_seen_at=?4 WHERE id=?5 AND ended_at IS NULL AND ' + observed).bind(deviceId, device.created_at, device.last_health_at, now, open.id).run();
        else {
            const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(deviceId + '|' + device.created_at + '|' + last))), id = 'off_' + Array.from(digest.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
            const statements: D1PreparedStatement[] = [];
            if (open)
                statements.push(db.prepare('UPDATE health_incidents SET ended_at=?4,last_seen_at=?5 WHERE id=?6 AND ended_at IS NULL AND ' + observed).bind(deviceId, device.created_at, device.last_health_at, last + 75000, now, open.id));
            statements.push(db.prepare("INSERT OR IGNORE INTO health_incidents(id,device_id,kind,severity,started_at,last_seen_at,detail_json) SELECT ?4,?1,'device_offline','critical',?5,?6,'{\"reason\":\"device_offline\"}' WHERE " + observed + " AND NOT EXISTS(SELECT 1 FROM health_incidents WHERE device_id=?1 AND ended_at IS NULL AND kind<>'backend_processing_failed')").bind(deviceId, device.created_at, device.last_health_at, id, last + 75000, now));
            await db.batch(statements);
        }
    }
    const rows = (await db.prepare('SELECT id,kind,severity FROM health_incidents WHERE device_id=?1 AND ended_at IS NULL AND alerted_at IS NULL AND started_at<=?2 ORDER BY started_at,id LIMIT 5').bind(deviceId, now - 60000).all<{
        id: string;
        kind: string;
        severity: string;
    }>()).results;
    let failed = false;
    for (const row of rows.slice(0, 4))
        try {
            const eventId = 'inc_' + row.id, detail = JSON.stringify({ incidentId: row.id, reason: row.kind, severity: row.severity }), kind = row.kind === 'device_offline' ? 'device_offline' : 'service_unhealthy';
            await db.prepare('INSERT OR IGNORE INTO safety_events(id,device_id,kind,device_created_at,server_created_at,latitude,longitude,accuracy_m,detail_json) SELECT ?1,?2,?3,?4,?4,NULL,NULL,NULL,?5 WHERE EXISTS(SELECT 1 FROM health_incidents i JOIN devices d ON d.id=i.device_id WHERE i.id=?6 AND i.device_id=?2 AND i.ended_at IS NULL AND i.alerted_at IS NULL AND d.revoked_at IS NULL)').bind(eventId, deviceId, kind, now, detail, row.id).run();
            const saved = await db.prepare('SELECT s.id,s.kind,s.device_created_at,s.server_created_at,s.detail_json FROM safety_events s JOIN health_incidents i ON i.id=?3 JOIN devices d ON d.id=s.device_id WHERE s.id=?1 AND s.device_id=?2 AND i.device_id=?2 AND i.ended_at IS NULL AND i.alerted_at IS NULL AND d.revoked_at IS NULL').bind(eventId, deviceId, row.id).first<{
                id: string;
                kind: RealtimeSafetyEvent['kind'];
                device_created_at: number;
                server_created_at: number;
                detail_json: string;
            }>();
            if (!saved) {
                const pending = await db.prepare('SELECT 1 FROM health_incidents i JOIN devices d ON d.id=i.device_id WHERE i.id=?1 AND i.device_id=?2 AND i.ended_at IS NULL AND i.alerted_at IS NULL AND d.revoked_at IS NULL').bind(row.id, deviceId).first();
                if (pending)
                    throw Error('watchdog durable event unavailable');
                continue;
            }
            const eventDetail = JSON.parse(saved.detail_json);
            if (saved.kind !== kind || !eventDetail || Object.keys(eventDetail).sort().join(',') !== 'incidentId,reason,severity' || eventDetail.incidentId !== row.id || eventDetail.reason !== row.kind || eventDetail.severity !== row.severity)
                throw Error('invalid watchdog durable event');
            const event: RealtimeSafetyEvent = { id: saved.id, kind: saved.kind, deviceCreatedAt: saved.device_created_at, serverCreatedAt: saved.server_created_at, latitude: null, longitude: null, accuracyM: null, detail: eventDetail };
            if (!await push(event))
                throw Error('watchdog delivery not accepted');
            await db.prepare('UPDATE health_incidents SET alerted_at=?1 WHERE id=?2 AND device_id=?3 AND ended_at IS NULL AND alerted_at IS NULL AND EXISTS(SELECT 1 FROM devices WHERE id=?3 AND revoked_at IS NULL)').bind(now, row.id, deviceId).run();
        }
        catch {
            failed = true;
        }
    if (failed)
        throw Error('watchdog delivery incomplete');
    return { complete: rows.length <= 4 };
}
