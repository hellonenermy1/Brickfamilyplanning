import { CARDFREE_PRIMARY_TABLES, CARDFREE_PRIMARY_EXCLUDED, CARDFREE_DIAGNOSTIC_TABLES, CARDFREE_DIAGNOSTIC_EXCLUDED, inspectCardfreeInventory, cardfreeCaptureColumns, encodeCardfreeCaptureRow, type Column } from './cardfree-recovery';
export const MAX_CAPTURE_PAGE_BYTES = 2 * 1024 * 1024, MAX_CAPTURE_PAGE_ROWS = 64;
export type CaptureFence = {
    captureId: string;
    generation: string;
    resourceSetSha256: string;
    sourceSha: string;
    pausedAt: number;
};
export type HeldCaptureFence = CaptureFence & {
    expiresAt: number;
    state: 'DRAINED';
    activeWriters: 0;
};
export type CaptureAuthority = {
    assertHeld(expected: CaptureFence): Promise<HeldCaptureFence>;
};
const encoder = new TextEncoder(), record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const digest = async (v: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(v))), x => x.toString(16).padStart(2, '0')).join('');
export async function assertCaptureFence(authority: CaptureAuthority, expected: CaptureFence) {
    if (!record(expected) || Object.keys(expected).sort().join(',') !== 'captureId,generation,pausedAt,resourceSetSha256,sourceSha' || !/^[a-f0-9]{32}$/.test(expected.captureId) || !/^[a-f0-9]{32}$/.test(expected.generation) || !/^[a-f0-9]{64}$/.test(expected.resourceSetSha256) || !/^[a-f0-9]{40}$/.test(expected.sourceSha) || !Number.isSafeInteger(expected.pausedAt) || expected.pausedAt <= 0)
        throw Error('invalid capture fence identity');
    const held = await authority.assertHeld({ ...expected }), now = Date.now();
    if (!record(held) || Object.keys(held).sort().join(',') !== 'activeWriters,captureId,expiresAt,generation,pausedAt,resourceSetSha256,sourceSha,state' || Object.keys(expected).some(k => held[k as keyof HeldCaptureFence] !== expected[k as keyof CaptureFence]) || held.state !== 'DRAINED' || held.activeWriters !== 0 || !Number.isSafeInteger(held.expiresAt) || held.expiresAt <= now || held.pausedAt > now || held.expiresAt > held.pausedAt + 300000)
        throw Error('capture fence unavailable');
    return held;
}
export async function readCardfreeCapturePage(env: {
    DB: D1Database;
    BETA_DB: D1Database;
}, request: {
    store: 'primary' | 'diagnostics';
    table: string;
    after: number | null;
    limit?: number;
    expectedSchemaSha256?: string;
    fence: CaptureFence;
}, authority: CaptureAuthority) {
    const { store, table, after } = request, limit = request.limit ?? MAX_CAPTURE_PAGE_ROWS, pin = { ...request.fence };
    if (!['primary', 'diagnostics'].includes(store) || !(after === null || Number.isSafeInteger(after)) || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_CAPTURE_PAGE_ROWS)
        throw Error('invalid capture page request');
    const durable = store === 'primary' ? CARDFREE_PRIMARY_TABLES : CARDFREE_DIAGNOSTIC_TABLES, excluded = store === 'primary' ? CARDFREE_PRIMARY_EXCLUDED : CARDFREE_DIAGNOSTIC_EXCLUDED;
    if (!durable.some(x => x === table))
        throw Error('unclassified capture table');
    await assertCaptureFence(authority, pin);
    const db = store === 'primary' ? env.DB : env.BETA_DB;
    await inspectCardfreeInventory(db, durable, excluded);
    const columns = await cardfreeCaptureColumns(db, table);
    if (columns.some(c => !/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(c.name) || c.name === '__brick_capture_cursor' || !['TEXT', 'INTEGER', 'REAL', 'BLOB'].includes(c.type.toUpperCase())))
        throw Error('unsupported capture schema');
    const schemaSha256 = await digest(JSON.stringify(columns));
    if (request.expectedSchemaSha256 !== undefined && request.expectedSchemaSha256 !== schemaSha256)
        throw Error('capture schema changed');
    const cost = (c: Column) => { const id = '"' + c.name + '"', base = encoder.encode(c.name).length * 6 + 8; return base + '+CASE WHEN ' + id + ' IS NULL THEN 4 ELSE ' + (c.type.toUpperCase() === 'BLOB' ? 'CAST((length(' + id + ')+2)/3 AS INTEGER)*4+32' : c.type.toUpperCase() === 'TEXT' ? 'length(CAST(json_quote(' + id + ') AS BLOB))+16' : '64') + ' END'; };
    const filters: string[] = [];
    if (['dev_object_store', 'dev_object_chunks'].includes(table))
        filters.push("key NOT LIKE 'backups/d1/%'");
    if (after !== null)
        filters.push('rowid>?1');
    const where = filters.length ? ' WHERE ' + filters.join(' AND ') : '';
    const metaStatement = db.prepare('SELECT rowid cursor,2+' + columns.map(cost).join('+') + ' estimatedBytes FROM ' + table + where + ' ORDER BY rowid LIMIT ' + (limit + 1));
    const meta = (await (after === null ? metaStatement : metaStatement.bind(after)).all<{
        cursor: number;
        estimatedBytes: number;
    }>()).results;
    const fixedBytes = encoder.encode(JSON.stringify(columns)).byteLength + 4096;
    let bytes = fixedBytes;
    const selected: typeof meta = [];
    let prior = after ?? -Infinity;
    for (const row of meta) {
        if (!Number.isSafeInteger(row.cursor) || row.cursor <= prior || !Number.isSafeInteger(row.estimatedBytes) || row.estimatedBytes < 0)
            throw Error('invalid capture row metadata');
        prior = row.cursor;
        if (selected.length === limit || bytes + row.estimatedBytes > MAX_CAPTURE_PAGE_BYTES)
            break;
        bytes += row.estimatedBytes;
        selected.push(row);
    }
    if (meta.length && !selected.length)
        throw Error('capture row exceeds page byte envelope');
    const data = selected.length ? (await db.prepare('SELECT rowid __brick_capture_cursor,' + columns.map(c => '"' + c.name + '"').join(',') + ' FROM ' + table + ' WHERE rowid IN(' + selected.map(() => '?').join(',') + ') ORDER BY rowid').bind(...selected.map(x => x.cursor)).all<Record<string, unknown>>()).results : [];
    if (data.length !== selected.length)
        throw Error('capture changed while reading');
    const rows = data.map((row, i) => { if (row.__brick_capture_cursor !== selected[i].cursor)
        throw Error('capture row identity changed'); const clean = { ...row }; delete clean.__brick_capture_cursor; return encodeCardfreeCaptureRow(clean, columns); });
    const page = { format: 'brick-cardfree-capture-page-v1' as const, fence: pin, store, table, after, next: selected.length ? selected[selected.length - 1].cursor : after, done: selected.length === meta.length, columns, schemaSha256, rows };
    const serialized = JSON.stringify(page);
    if (encoder.encode(serialized).byteLength > MAX_CAPTURE_PAGE_BYTES)
        throw Error('capture page byte envelope exceeded');
    await assertCaptureFence(authority, pin);
    return { ...page, sha256: await digest(serialized) };
}
