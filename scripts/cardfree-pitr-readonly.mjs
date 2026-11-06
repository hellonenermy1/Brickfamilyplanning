// GET-only metadata for explicitly pinned beta D1 IDs. No SQL, restore, or token fallback.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const API = 'https://api.cloudflare.com/client/v4', sha = x => createHash('sha256').update(x).digest('hex'), uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export async function attestCardfreePitr({ token, plan, request = fetch, now = Date.now() } = {}) {
    const result = { format: 'brick-cardfree-pitr-metadata-v1', checkedAt: Number.isSafeInteger(now) && now > 0 && Number.isFinite(new Date(now).getTime()) ? new Date(now).toISOString() : null, checksPassed: false, recoveryProven: false, retentionWindowVerified: false, activeWorkerBindingsVerified: false, requestsMade: 0, resources: [] };
    const blocked = code => { result.resources = [{ role: 'primary', status: 'BLOCKED', code }, { role: 'diagnostics', status: 'BLOCKED', code }]; return result; };
    if (typeof token !== 'string' || !token.length)
        return blocked('DEDICATED_READ_TOKEN_REQUIRED');
    if (!record(plan) || Object.keys(plan).some(k => !['accountId', 'primaryId', 'diagnosticId', 'asOf'].includes(k)) || !/^[a-f0-9]{32}$/i.test(plan.accountId ?? '') || !uuid.test(plan.primaryId ?? '') || !uuid.test(plan.diagnosticId ?? '') || plan.primaryId.toLowerCase() === plan.diagnosticId.toLowerCase() || !result.checkedAt)
        return blocked('PINNED_RESOURCE_PLAN_REQUIRED');
    const target = plan.asOf === undefined ? null : Date.parse(plan.asOf);
    if (target !== null && (!Number.isFinite(target) || typeof plan.asOf !== 'string' || !plan.asOf.endsWith('Z') || target > now || target < now - 7 * 86400000))
        return blocked('INVALID_CARD_FREE_HISTORY_TARGET');
    result.accountSha256 = sha(plan.accountId.toLowerCase());
    async function get(id, suffix = '') {
        if (!['', '/time_travel/bookmark', target === null ? '' : ('/time_travel/bookmark?timestamp=' + encodeURIComponent(new Date(target).toISOString()))].includes(suffix))
            throw Error('GET_PATH_REFUSED');
        result.requestsMade++;
        const response = await request(API + '/accounts/' + plan.accountId + '/d1/database/' + id + suffix, { method: 'GET', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15000) });
        if (response?.status === 401 || response?.status === 403)
            throw Error('READ_ACCESS_DENIED');
        if (!response?.ok || !response.body)
            throw Error('METADATA_UNAVAILABLE');
        const reader = response.body.getReader(), parts = [];
        let size = 0;
        try {
            for (;;) {
                const r = await reader.read();
                if (r.done)
                    break;
                size += r.value.byteLength;
                if (size > 65536) {
                    await reader.cancel();
                    throw Error('METADATA_ENVELOPE');
                }
                parts.push(r.value);
            }
        }
        finally {
            reader.releaseLock();
        }
        const bytes = Buffer.concat(parts.map(x => Buffer.from(x)));
        let data;
        try {
            data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        }
        catch {
            throw Error('METADATA_SHAPE');
        }
        if (!record(data) || data.success !== true || !record(data.result))
            throw Error('METADATA_SHAPE');
        return data.result;
    }
    const bookmark = value => { if (typeof value?.bookmark !== 'string' || !value.bookmark.length || value.bookmark.length > 1024)
        throw Error('BOOKMARK_UNAVAILABLE'); return { status: 'ATTESTED', bookmarkSha256: sha(value.bookmark) }; };
    const expected = [['primary', plan.primaryId, 'brick-family-beta'], ['diagnostics', plan.diagnosticId, 'brick-family-beta-diagnostics']];
    for (let i = 0; i < expected.length; i++) {
        const [role, id, name] = expected[i], entry = { role, resourceSha256: sha(id.toLowerCase()), status: 'BLOCKED' };
        result.resources.push(entry);
        try {
            const meta = await get(id), identity = meta.uuid ?? meta.id, createdAt = Date.parse(meta.created_at);
            if (typeof identity !== 'string' || identity.toLowerCase() !== id.toLowerCase() || meta.name !== name || !Number.isFinite(createdAt) || createdAt > now)
                throw Error('RESOURCE_IDENTITY_MISMATCH');
            entry.identity = 'ATTESTED';
            entry.createdAt = new Date(createdAt).toISOString();
            entry.current = bookmark(await get(id, '/time_travel/bookmark'));
            if (target !== null)
                entry.historical = target < createdAt ? { status: 'NOT_APPLICABLE', code: 'DATABASE_CREATED_AFTER_TARGET', requestedAt: new Date(target).toISOString() } : { ...bookmark(await get(id, '/time_travel/bookmark?timestamp=' + encodeURIComponent(new Date(target).toISOString()))), requestedAt: new Date(target).toISOString() };
            entry.status = 'ATTESTED';
        }
        catch (e) {
            const known = ['READ_ACCESS_DENIED', 'METADATA_UNAVAILABLE', 'METADATA_ENVELOPE', 'METADATA_SHAPE', 'BOOKMARK_UNAVAILABLE', 'RESOURCE_IDENTITY_MISMATCH'];
            entry.code = known.includes(e?.message) ? e.message : 'METADATA_UNAVAILABLE';
            entry.status = entry.code === 'RESOURCE_IDENTITY_MISMATCH' ? 'DRIFT' : 'BLOCKED';
            for (const [later] of expected.slice(i + 1))
                result.resources.push({ role: later, status: 'BLOCKED', code: 'NO_REQUEST_AFTER_FAILED_CHECK' });
            break;
        }
    }
    result.checksPassed = result.resources.length === 2 && result.resources.every(x => x.status === 'ATTESTED');
    return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        if (process.argv.length !== 3)
            throw Error('private plan required');
        const fd = fs.openSync(process.argv[2], fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        let plan;
        try {
            const stat = fs.fstatSync(fd);
            if (!stat.isFile() || stat.size > 16384 || (stat.mode & 0o077))
                throw Error('private plan required');
            plan = JSON.parse(fs.readFileSync(fd, 'utf8'));
        }
        finally {
            fs.closeSync(fd);
        }
        const result = await attestCardfreePitr({ token: process.env.CLOUDFLARE_AUDIT_READ_TOKEN, plan });
        console.log(JSON.stringify(result));
        if (!result.checksPassed)
            process.exitCode = 2;
    }
    catch {
        console.error('PITR metadata check requires a private pinned plan and dedicated D1 read capability; no recovery is authorized.');
        process.exitCode = 1;
    }
}
