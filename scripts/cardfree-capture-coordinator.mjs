// Off-platform only. Source/authority adapters are trusted operator capabilities.
// This code does not install a writer fence, expose a capture route, or access a live account.
import fs from 'node:fs';
import path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { backupKey, sealBackup, openBackup, validateBackupContext, MAX_PACKAGE_BYTES } from './cardfree-backup-package.mjs';
const MAX_PAGE = 2 * 1024 * 1024, MAX_JOURNAL_ENTRY = MAX_PAGE + 65536, MAX_CAPTURE = 16 * 1024 * 1024;
const MAGIC = Buffer.from('BRICKCJ1'), sha = x => createHash('sha256').update(x).digest('hex');
const exact = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === [...keys].sort().join(',');
const canonicalContext = c => Object.fromEntries(['deployment', 'sourceSha', 'backupId', 'capturedAt', 'keyId'].map(k => [k, c[k]]));
const canonicalFence = f => Object.fromEntries(['captureId', 'generation', 'resourceSetSha256', 'sourceSha', 'pausedAt'].map(k => [k, f[k]]));
function journalSeal(value, key, aad) { const bytes = Buffer.from(JSON.stringify(value)); if (bytes.length > MAX_JOURNAL_ENTRY - 36)
    throw Error('journal envelope'); const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, nonce); cipher.setAAD(aad); try {
    const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), encrypted]);
}
finally {
    bytes.fill(0);
} }
function journalOpen(bytes, key, aad) { if (!(bytes instanceof Uint8Array) || bytes.length <= 36 || bytes.length > MAX_JOURNAL_ENTRY)
    throw Error('journal size'); bytes = Buffer.from(bytes); if (!bytes.subarray(0, 8).equals(MAGIC))
    throw Error('journal format'); const d = createDecipheriv('aes-256-gcm', key, bytes.subarray(8, 20)); d.setAAD(aad); d.setAuthTag(bytes.subarray(20, 36)); let body; try {
    body = Buffer.concat([d.update(bytes.subarray(36)), d.final()]);
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
}
finally {
    body?.fill(0);
} }
export function privateCaptureJournal(directory) {
    const root = path.resolve(directory);
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077))
        throw Error('private journal required');
    function name(key) { if (typeof key !== 'string' || !/^[a-z0-9_-]{1,160}$/.test(key))
        throw Error('journal name'); return path.join(root, key); }
    return {
        async read(key) { const file = name(key); let fd; try {
            fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
            const s = fs.fstatSync(fd);
            if (!s.isFile() || (s.mode & 0o077) || s.size > MAX_JOURNAL_ENTRY)
                throw Error('private journal file required');
            return fs.readFileSync(fd);
        }
        catch (e) {
            if (e.code === 'ENOENT')
                return null;
            throw e;
        }
        finally {
            if (fd !== undefined)
                fs.closeSync(fd);
        } },
        async create(key, bytes) { if (!(bytes instanceof Uint8Array) || bytes.length > MAX_JOURNAL_ENTRY)
            throw Error('journal envelope'); const target = name(key), temp = target + '.tmp-' + randomBytes(8).toString('hex'); let fd; try {
            fd = fs.openSync(temp, 'wx', 0o600);
            fs.writeFileSync(fd, bytes);
            fs.fsyncSync(fd);
            fs.closeSync(fd);
            fd = undefined;
            try {
                fs.linkSync(temp, target);
            }
            catch (e) {
                if (e.code === 'EEXIST')
                    return false;
                throw e;
            }
            const parent = fs.openSync(root, fs.constants.O_RDONLY);
            try {
                fs.fsyncSync(parent);
            }
            finally {
                fs.closeSync(parent);
            }
            return true;
        }
        finally {
            if (fd !== undefined)
                fs.closeSync(fd);
            fs.rmSync(temp, { force: true });
        } }
    };
}
export async function captureProtectedBackup({ context: input, expectedFence: pin, runtime, source, authority, journal, key: base64, maxRetries = 2, readTimeoutMs = 15000, pause = ms => new Promise(r => setTimeout(r, ms)) }) {
    validateBackupContext(input);
    if (!runtime || typeof runtime.assertCaptureFence !== 'function' || typeof runtime.finalizeCardfreeCapture !== 'function' || typeof source?.readPage !== 'function' || typeof source?.deviceSnapshot !== 'function' || typeof authority?.release !== 'function' || typeof journal?.read !== 'function' || typeof journal?.create !== 'function' || !Number.isSafeInteger(maxRetries) || maxRetries < 0 || maxRetries > 2 || !Number.isSafeInteger(readTimeoutMs) || readTimeoutMs < 5 || readTimeoutMs > 30000)
        throw Error('CAPTURE_CONFIGURATION_INVALID');
    const context = Object.freeze(canonicalContext(input)), expected = Object.freeze(canonicalFence(pin));
    if (expected.captureId !== context.backupId || expected.sourceSha !== context.sourceSha || expected.pausedAt !== context.capturedAt)
        throw Error('CAPTURE_CONTEXT_MISMATCH');
    const key = backupKey(base64);
    let output, failed = false, releaseFailed = false;
    const stats = { sourceReads: 0, journalHits: 0, retries: 0, pages: 0, rows: 0, devices: 0 };
    async function bounded(work) { let timer; try {
        return await Promise.race([Promise.resolve().then(work), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('capture capability timeout')), readTimeoutMs); })]);
    }
    finally {
        clearTimeout(timer);
    } }
    const held = () => bounded(() => runtime.assertCaptureFence({ assertHeld: e => bounded(() => authority.assertHeld(e)) }, expected));
    const retry = async (work) => { for (let attempt = 0;; attempt++) {
        await held();
        try {
            return await bounded(work);
        }
        catch {
            if (attempt === maxRetries)
                throw Error('source retry exhausted');
            stats.retries++;
            await pause(50 * 2 ** attempt);
        }
    } };
    async function item(name, produce, validate) {
        await held();
        const aad = Buffer.from(JSON.stringify({ format: 'brick-capture-journal-v1', context, fence: expected, name }));
        const existing = await journal.read(name);
        if (existing !== null) {
            const value = journalOpen(existing, key, aad);
            validate(value);
            await held();
            stats.journalHits++;
            return value;
        }
        const value = await retry(produce);
        validate(value);
        await held();
        const encrypted = journalSeal(value, key, aad);
        await journal.create(name, encrypted);
        const stored = await journal.read(name);
        if (stored === null)
            throw Error('journal publication unavailable');
        const actual = journalOpen(stored, key, aad);
        validate(actual);
        if (JSON.stringify(actual) !== JSON.stringify(value))
            throw Error('journal ownership mismatch');
        await held();
        return actual;
    }
    try {
        await held();
        const snapshot = { format: 'brick-cardfree-d1-v1', createdAt: context.capturedAt, primary: { columns: {}, tables: {} }, diagnostics: { columns: {}, tables: {} } };
        let collectedBytes = 0;
        for (const [store, tables] of [['primary', runtime.CARDFREE_PRIMARY_TABLES], ['diagnostics', runtime.CARDFREE_DIAGNOSTIC_TABLES]]) {
            if (!Array.isArray(tables) || tables.length !== (store === 'primary' ? 41 : 4) || new Set(tables).size !== tables.length)
                throw Error('capture table plan');
            for (const table of tables) {
                let after = null, index = 0, schema = null;
                const rows = [];
                for (;;) {
                    const request = { store, table, after, fence: expected, ...(schema ? { expectedSchemaSha256: schema } : {}) };
                    const validate = p => { if (!exact(p, ['format', 'fence', 'store', 'table', 'after', 'next', 'done', 'columns', 'schemaSha256', 'rows', 'sha256']) || p.format !== 'brick-cardfree-capture-page-v1' || p.store !== store || p.table !== table || p.after !== after || !exact(p.fence, Object.keys(expected)) || Object.keys(expected).some(k => p.fence[k] !== expected[k]) || typeof p.done !== 'boolean' || !Array.isArray(p.columns) || !p.columns.length || !Array.isArray(p.rows) || p.rows.length > 64 || !/^[a-f0-9]{64}$/.test(p.schemaSha256) || sha(JSON.stringify(p.columns)) !== p.schemaSha256 || schema !== null && schema !== p.schemaSha256 || !(p.next === null || Number.isSafeInteger(p.next)) || p.rows.length === 0 && (!p.done || p.next !== after) || p.rows.length > 0 && (p.next === null || after !== null && p.next <= after))
                        throw Error('capture page mismatch'); const unsigned = { ...p }; delete unsigned.sha256; if (sha(JSON.stringify(unsigned)) !== p.sha256 || Buffer.byteLength(JSON.stringify(p)) > MAX_PAGE + 256)
                        throw Error('capture page integrity'); };
                    const page = await item('page-' + store + '-' + table + '-' + index, async () => { stats.sourceReads++; return source.readPage(request); }, validate);
                    if (schema === null) {
                        schema = page.schemaSha256;
                        snapshot[store].columns[table] = page.columns;
                    }
                    collectedBytes += Buffer.byteLength(JSON.stringify(page.rows));
                    if (collectedBytes > MAX_CAPTURE || rows.length + page.rows.length > 100000)
                        throw Error('capture collection bound');
                    rows.push(...page.rows);
                    stats.pages++;
                    stats.rows += page.rows.length;
                    if (page.done)
                        break;
                    after = page.next;
                    if (++index > 100000)
                        throw Error('capture page count');
                }
                snapshot[store].tables[table] = rows;
            }
        }
        await held();
        const d1 = await runtime.finalizeCardfreeCapture(snapshot);
        await held();
        const devices = snapshot.primary.tables.devices;
        if (!Array.isArray(devices) || devices.length > 1000)
            throw Error('capture device envelope');
        const doSnapshots = [];
        let doBytes = 0;
        for (let i = 0; i < devices.length; i++) {
            const device = devices[i];
            if (typeof device.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(device.id))
                throw Error('capture device identity');
            const validate = value => { if (!exact(value, ['id', 'serialized', 'sha256']) || value.id !== device.id || typeof value.serialized !== 'string' || Buffer.byteLength(value.serialized) > 65536 || sha(value.serialized) !== value.sha256)
                throw Error('capture DO integrity'); const state = JSON.parse(value.serialized); if (state.deviceId !== device.id || state.keySha256 !== sha(device.public_key_spki_b64) || !Number.isSafeInteger(state.capturedAt) || state.capturedAt < context.capturedAt)
                throw Error('capture DO identity'); };
            const value = await item('device-' + i, async () => { stats.sourceReads++; const serialized = await source.deviceSnapshot(device.id, expected); return { id: device.id, serialized, sha256: sha(serialized) }; }, validate);
            doBytes += Buffer.byteLength(value.serialized);
            if (4 * Math.ceil(doBytes / 3) + 4 * Math.ceil(d1.body.byteLength / 3) + (i + 1) * 1024 + 4096 > MAX_PACKAGE_BYTES)
                throw Error('capture package bound');
            doSnapshots.push(value);
            stats.devices++;
        }
        await held();
        const encrypted = sealBackup({ context, body: d1.body, doSnapshots }, base64);
        const reopened = openBackup(encrypted, base64, context);
        if (reopened.sha256 !== d1.sha256 || reopened.doSnapshots.length !== devices.length)
            throw Error('capture seal verification');
        await held();
        output = { status: 'SEALED_SOURCE_CAPTURE', encrypted, receipt: { format: 'brick-capture-receipt-v1', context, fenceSha256: sha(JSON.stringify(expected)), archiveSha256: sha(encrypted), d1Sha256: d1.sha256, primaryTables: 41, diagnosticTables: 4, devices: devices.length }, stats };
    }
    catch {
        failed = true;
    }
    finally {
        try {
            const released = await bounded(() => authority.release(expected));
            if (!released || released.released !== true || released.generation !== expected.generation)
                releaseFailed = true;
        }
        catch {
            releaseFailed = true;
        }
        key.fill(0);
    }
    if (releaseFailed)
        throw Error('CAPTURE_RELEASE_FAILED');
    if (failed)
        throw Error('CAPTURE_FAILED');
    return output;
}
