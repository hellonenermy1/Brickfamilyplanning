import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CF_API = 'https://api.cloudflare.com/client/v4';
const D1_NAME = 'brick-family-v1-dev';
const ORIGIN = (process.env.BRICK_DEV_PARENT_ORIGIN || 'https://brick-family-v1-dev.lumjayvian.workers.dev').replace(/\/$/, '');
const token = process.env.CLOUDFLARE_API_TOKEN;
const explicitAccount = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required');

async function cf(apiPath, init = {}) {
  const response = await fetch(CF_API + apiPath, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(`Cloudflare API ${response.status} for ${apiPath}: ${JSON.stringify(body.errors || body)}`);
  }
  return body.result;
}

async function accountId() {
  const accounts = await cf('/accounts?per_page=50');
  if (!Array.isArray(accounts) || accounts.length === 0) throw new Error('No Cloudflare account is visible to the token');
  if (explicitAccount) {
    const found = accounts.find(a => a.id === explicitAccount);
    if (!found) throw new Error('CLOUDFLARE_ACCOUNT_ID is not visible to the token');
    return found.id;
  }
  if (accounts.length !== 1) throw new Error(`Token sees ${accounts.length} accounts; set CLOUDFLARE_ACCOUNT_ID`);
  return accounts[0].id;
}

const sha256Hex = value => createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(fn, { timeoutMs = 20_000, intervalMs = 150, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) { lastError = error; }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  throw new Error(`Chrome/Chromium not found. Checked: ${candidates.join(', ')}`);
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    ws.onmessage = event => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${message.error.message || 'CDP error'} (${message.error.code || 'unknown'})`));
        else pending.resolve(message.result || {});
        return;
      }
      for (const listener of this.listeners) listener(message);
    };
    ws.onclose = () => {
      for (const pending of this.pending.values()) pending.reject(new Error('CDP WebSocket closed'));
      this.pending.clear();
    };
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP WebSocket connect timeout')), 10_000);
      ws.onopen = () => { clearTimeout(timer); resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('CDP WebSocket connection failed')); };
    });
    return new Cdp(ws);
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  on(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  close() { try { this.ws.close(); } catch {} }
}

async function launchChrome() {
  const chrome = findChrome();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brick-p7-chrome-'));
  const port = 9222;
  const child = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist',
    '--enable-webgl', '--use-gl=swiftshader', `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1', `--user-data-dir=${userDataDir}`,
    '--window-size=1440,1100', 'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => {
    stderr += String(chunk);
    if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
  });
  const version = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`).catch(() => null);
    return response?.ok ? response.json() : null;
  }, { timeoutMs: 15_000, label: 'Chrome DevTools endpoint' }).catch(error => {
    child.kill('SIGKILL');
    throw new Error(`${error.message}\nChrome stderr:\n${stderr}`);
  });
  return { child, userDataDir, browserWs: version.webSocketDebuggerUrl, version };
}

async function browserAcceptance(session) {
  // Only privacy-safe JSON is written. Never persist screenshots, coordinates, map imagery, device
  // names, device IDs, place names or raw portal text in CI artifacts.
  fs.mkdirSync('phase7-browser-evidence', { recursive: true });
  const browser = await launchChrome();
  const cdp = await Cdp.connect(browser.browserWs);
  const runtimeErrors = [];
  const consoleErrors = [];
  let pageSession;

  try {
    const target = await cdp.send('Target.createTarget', { url: 'about:blank', width: 1440, height: 1100 });
    pageSession = (await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId;
    cdp.on(message => {
      if (message.sessionId !== pageSession) return;
      if (message.method === 'Runtime.exceptionThrown') {
        runtimeErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'runtime exception');
      } else if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
        consoleErrors.push((message.params.args || []).map(x => x.value ?? x.description ?? '').join(' ') || 'console.error');
      } else if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
        consoleErrors.push(message.params.entry.text || 'browser log error');
      }
    });

    await Promise.all([
      cdp.send('Page.enable', {}, pageSession),
      cdp.send('Runtime.enable', {}, pageSession),
      cdp.send('Network.enable', {}, pageSession),
      cdp.send('Log.enable', {}, pageSession)
    ]);
    await cdp.send('Network.setCookie', {
      name: 'brick_parent_dev', value: session, url: ORIGIN, secure: true, httpOnly: true, sameSite: 'Strict'
    }, pageSession);

    const evaluate = async expression => {
      const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, pageSession);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Runtime.evaluate failed');
      return result.result?.value;
    };

    await cdp.send('Page.navigate', { url: `${ORIGIN}/parent` }, pageSession);
    await waitFor(() => evaluate('document.readyState === "complete"'), { timeoutMs: 25_000, label: 'parent page load' });
    await waitFor(() => evaluate("document.querySelectorAll('#devices option').length > 0"), { label: 'paired device list' });
    await waitFor(async () => /PORTAL (LIVE|CONNECTING|RECONNECTING)/.test(await evaluate("document.querySelector('#portalLive')?.textContent || ''")), { label: 'portal connection state' });

    const desktop = await evaluate(`(() => ({
      titleOk:/Phase 7 Development/.test(document.title),
      badgeOk:/PHASE 7 BETA/.test(document.querySelector('.devBadge')?.textContent||''),
      devicePresent:Boolean(document.querySelector('#devices')?.value),
      tabs:[...document.querySelectorAll('.tabs button')].map(x=>x.dataset.tab),
      width:innerWidth, scrollWidth:document.documentElement.scrollWidth,
      mapFallback:(document.querySelector('#map')?.textContent||'').includes('Map unavailable on this browser'),
      mapCanvas:Boolean(document.querySelector('#map canvas'))
    }))()`);
    assert.equal(desktop.titleOk, true, 'Phase 7 page title missing');
    assert.equal(desktop.badgeOk, true, 'Phase 7 beta badge missing');
    assert.equal(desktop.devicePresent, true, 'paired device not selected');
    assert.deepEqual(desktop.tabs, ['now', 'history', 'trips', 'places', 'health', 'debug']);
    assert.ok(desktop.scrollWidth <= desktop.width + 2, `desktop horizontal overflow: ${desktop.scrollWidth} > ${desktop.width}`);
    assert.ok(desktop.mapCanvas || desktop.mapFallback, 'map neither rendered nor entered explicit fallback');

    const tabResults = await evaluate(`(async()=>{const out=[];for(const name of ['now','history','trips','places','health','debug']){const b=document.querySelector('.tabs button[data-tab="'+name+'"]');b.click();await new Promise(r=>setTimeout(r,60));const p=document.getElementById(name);out.push([name,b.classList.contains('active'),p?.classList.contains('active'),p?getComputedStyle(p).display:null])}return out})()`);
    for (const [name, buttonActive, paneActive, display] of tabResults) {
      assert.equal(buttonActive, true, `${name} tab button did not activate`);
      assert.equal(paneActive, true, `${name} pane did not activate`);
      assert.notEqual(display, 'none', `${name} pane remained hidden`);
    }

    const rendered = await evaluate(`(() => ({
      confidence:document.querySelector('#p7Confidence')?.textContent?.trim(),
      evidenceAge:document.querySelector('#p7EvidenceAge')?.textContent?.trim(),
      geometry:document.querySelector('#p7Geometry')?.textContent?.trim(),
      source:document.querySelector('#p7PresentationSource')?.textContent?.trim(),
      positionHealth:document.querySelector('#p7PositionHealthSummary')?.textContent?.trim(),
      providers:document.querySelector('#p7Providers')?.textContent?.trim(),
      gpsActual:document.querySelector('#gpsActual')?.textContent?.trim(),
      gpsAck:document.querySelector('#gpsAck')?.textContent?.trim(),
      gpsObserved:document.querySelector('#gpsObserved')?.textContent?.trim(),
      refinedToggle:Boolean(document.querySelector('#historyRefinedToggle')),
      speeds:[...document.querySelectorAll('#playSpeed option')].map(o=>o.value)
    }))()`);
    for (const [name, value] of Object.entries({
      confidence: rendered.confidence, evidenceAge: rendered.evidenceAge, geometry: rendered.geometry,
      source: rendered.source, positionHealth: rendered.positionHealth, providers: rendered.providers,
      gpsActual: rendered.gpsActual, gpsAck: rendered.gpsAck, gpsObserved: rendered.gpsObserved
    })) assert.ok(value && value !== '—', `${name} was not rendered`);
    assert.equal(rendered.refinedToggle, true, 'refined-history toggle missing');
    assert.deepEqual(rendered.speeds, ['0.5', '1', '2', '5', '10']);

    await evaluate("document.querySelector('.tabs button[data-tab=\"debug\"]')?.click();document.querySelector('#debugSelfCheck')?.click();true");
    const selfCheck = await waitFor(async () => {
      const text = await evaluate("document.querySelector('#debugCheckResult')?.textContent || ''");
      return /^(PASS:|Attention:)/.test(text) ? text : null;
    }, { label: 'portal self-check' });
    assert.match(selfCheck, /^PASS:/, `portal self-check failed: ${selfCheck}`);
    assert.match(selfCheck, /0 failed/);

    // Exercise real read-only history against the deployed worker. Prefer Today; fall back to 7 days
    // when there is no data today. Trusted history must remain the base route while the refined layer
    // can be toggled independently.
    await evaluate("document.querySelector('.tabs button[data-tab=\"history\"]')?.click();document.querySelector('.rangeBtn[data-range=\"today\"]')?.click();true");
    let historyNote = await waitFor(async () => {
      const text = await evaluate("document.querySelector('#historyNote')?.textContent || ''");
      return /trusted evidence points/.test(text) ? text : null;
    }, { label: 'Today history load' });
    let trustedPoints = Number((historyNote.match(/^(\d+) trusted evidence points/) || [])[1] || 0);
    if (trustedPoints === 0) {
      await evaluate("document.querySelector('.rangeBtn[data-range=\"7\"]')?.click();true");
      historyNote = await waitFor(async () => {
        const text = await evaluate("document.querySelector('#historyNote')?.textContent || ''");
        return /trusted evidence points/.test(text) ? text : null;
      }, { label: '7-day history load' });
      trustedPoints = Number((historyNote.match(/^(\d+) trusted evidence points/) || [])[1] || 0);
    }
    assert.ok(trustedPoints > 0, 'live browser history acceptance found no trusted history in Today or 7 days');

    const history = await evaluate(`(() => ({
      seekMax:Number(document.querySelector('#seek')?.max||0),
      stops:document.querySelector('#sumStops')?.textContent?.trim()||'',
      distance:document.querySelector('#sumDistance')?.textContent?.trim()||'',
      duration:document.querySelector('#sumDuration')?.textContent?.trim()||'',
      refinedNote:document.querySelector('#refinedHistoryNote')?.textContent?.trim()||'',
      refinedChecked:Boolean(document.querySelector('#historyRefinedToggle')?.checked),
      timelineCount:document.querySelectorAll('#timeline .timelineItem').length
    }))()`);
    assert.equal(history.seekMax, Math.max(0, trustedPoints - 1), 'history seek range does not match trusted point count');
    assert.match(history.stops, /^\d+$/, 'history meaningful-stop summary did not render');
    assert.ok(history.distance, 'history distance summary missing');
    assert.ok(history.duration, 'history duration summary missing');
    assert.ok(history.timelineCount > 0, 'history timeline did not render');
    assert.equal(history.refinedChecked, true, 'refined overlay should default on');
    assert.ok(history.refinedNote, 'refined-history status did not render');

    const speedExercise = await evaluate(`(async()=>{const s=document.querySelector('#playSpeed'),out=[];for(const v of ['0.5','1','2','5','10']){s.value=v;s.dispatchEvent(new Event('change',{bubbles:true}));out.push(s.value)}const t=document.querySelector('#historyRefinedToggle');t.checked=false;t.dispatchEvent(new Event('change',{bubbles:true}));const off=!t.checked;t.checked=true;t.dispatchEvent(new Event('change',{bubbles:true}));const on=t.checked;return{out,off,on}})()`);
    assert.deepEqual(speedExercise.out, ['0.5', '1', '2', '5', '10'], 'one or more playback speeds could not be selected');
    assert.equal(speedExercise.off, true, 'refined overlay did not toggle off');
    assert.equal(speedExercise.on, true, 'refined overlay did not toggle back on');

    let playbackExercised = false;
    if (trustedPoints > 1) {
      await evaluate("document.querySelector('#playSpeed').value='0.5';document.querySelector('#playBtn')?.click();true");
      await waitFor(async () => (await evaluate("document.querySelector('#playBtn')?.textContent || ''")) === '❚❚', { timeoutMs: 3_000, label: 'history playback start' });
      await sleep(120);
      await evaluate("document.querySelector('#playBtn')?.click();true");
      await waitFor(async () => (await evaluate("document.querySelector('#playBtn')?.textContent || ''")) === '▶', { timeoutMs: 3_000, label: 'history playback stop' });
      playbackExercised = true;
    }

    // Real responsive layout and interactions at a common phone viewport. This is browser-layout
    // evidence, not a claim that a physical handset/touch stack was tested.
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, pageSession);
    await sleep(400);
    const mobile = await evaluate(`(() => {const h=document.querySelector('header')?.getBoundingClientRect(),t=document.querySelector('.tabs')?.getBoundingClientRect();return{width:innerWidth,scrollWidth:document.documentElement.scrollWidth,headerRight:h?.right??9999,tabsRight:t?.right??9999,refined:Boolean(document.querySelector('#historyRefinedToggle')),ack:Boolean(document.querySelector('#gpsAck')),debug:Boolean(document.querySelector('#debugSelfCheck'))}})()`);
    assert.equal(mobile.width, 390);
    assert.ok(mobile.scrollWidth <= mobile.width + 2, `mobile horizontal overflow: ${mobile.scrollWidth} > ${mobile.width}`);
    assert.ok(mobile.headerRight <= mobile.width + 2, 'mobile header exceeds viewport');
    assert.ok(mobile.tabsRight <= mobile.width + 2, 'mobile tabs exceed viewport');
    assert.equal(mobile.refined && mobile.ack && mobile.debug, true, 'required controls missing at mobile width');
    const mobileTabs = await evaluate(`(async()=>{const out=[];for(const name of ['now','history','trips','places','health','debug']){const b=document.querySelector('.tabs button[data-tab="'+name+'"]');b.scrollIntoView({block:'nearest',inline:'nearest'});b.click();await new Promise(r=>setTimeout(r,40));out.push(document.getElementById(name)?.classList.contains('active')===true)}return out})()`);
    assert.ok(mobileTabs.every(Boolean), 'one or more tabs failed at mobile width');

    // Simulate a real network loss and require automatic recovery without page reload/manual sync.
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, pageSession);
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: 'none' }, pageSession);
    await waitFor(async () => /OFFLINE/.test(await evaluate("document.querySelector('#portalLive')?.textContent || ''")), { timeoutMs: 12_000, label: 'offline portal state' });
    await sleep(800);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: -1, uploadThroughput: -1, connectionType: 'wifi' }, pageSession);
    await waitFor(async () => /PORTAL LIVE/.test(await evaluate("document.querySelector('#portalLive')?.textContent || ''")), { timeoutMs: 25_000, label: 'automatic portal recovery' });
    await evaluate("document.querySelector('.tabs button[data-tab=\"debug\"]')?.click();true");
    const recovered = await evaluate(`(() => ({live:/LIVE/.test(document.querySelector('#portalLive')?.textContent||''),browser:/online/i.test(document.querySelector('#debugBrowserNetwork')?.textContent||''),ws:/live/i.test(document.querySelector('#debugWs')?.textContent||'')}))()`);
    assert.equal(recovered.live && recovered.browser && recovered.ws, true, 'portal did not fully recover after network restore');

    if (runtimeErrors.length) throw new Error(`Browser runtime exception: ${runtimeErrors[0]}`);
    const actionableConsoleErrors = consoleErrors.filter(x => x && !/favicon[^\n]*404|Failed to load resource[^\n]*404/i.test(x));
    if (actionableConsoleErrors.length) throw new Error(`Browser console/log error: ${actionableConsoleErrors[0]}`);

    const refinedObserved = !/No refined history is available/i.test(history.refinedNote);
    const evidence = {
      result: 'PASS',
      browserEngine: 'Chromium',
      desktopInteraction: true,
      mobileViewport390x844: true,
      selectedDevicePresent: true,
      mapRenderedOrExplicitFallback: true,
      portalSelfCheckPass: true,
      history: {
        trustedPointsObserved: trustedPoints,
        timelineRendered: true,
        allPlaybackSpeedsSelectable: true,
        playbackStartStopExercised: playbackExercised,
        refinedOverlayToggleExercised: true,
        refinedFramesNaturallyObserved: refinedObserved
      },
      offlineReconnectAutomatic: true,
      runtimeExceptionCount: 0,
      actionableConsoleErrorCount: 0,
      privacy: 'no screenshots, coordinates, map imagery, device IDs, device names or place names retained',
      generatedAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join('phase7-browser-evidence', 'result.json'), JSON.stringify(evidence, null, 2));
    console.log('Phase 7 live browser acceptance PASS.');
    console.log(`History: ${trustedPoints} trusted point(s); playback start/stop exercised=${playbackExercised}; refined data naturally observed=${refinedObserved}.`);
    console.log('Desktop interaction + 390x844 responsive interaction + offline/reconnect PASS.');
  } finally {
    cdp.close();
    browser.child.kill('SIGTERM');
    await sleep(250);
    if (!browser.child.killed) browser.child.kill('SIGKILL');
    fs.rmSync(browser.userDataDir, { recursive: true, force: true });
  }
}

const account = await accountId();
const databases = await cf(`/accounts/${account}/d1/database?per_page=100`);
const db = Array.isArray(databases) ? databases.find(x => x.name === D1_NAME) : null;
if (!db?.uuid) throw new Error(`${D1_NAME} D1 database not found`);
const d1Query = (sql, params = []) => cf(`/accounts/${account}/d1/database/${db.uuid}/query`, {
  method: 'POST', body: JSON.stringify({ sql, params })
});

const session = randomBytes(32).toString('base64url');
const sessionHash = sha256Hex(session);
const now = Date.now();
await d1Query('INSERT INTO dev_parent_sessions(session_hash,created_at,expires_at,revoked_at) VALUES(?1,?2,?3,NULL)', [sessionHash, now, now + 10 * 60_000]);
try {
  await browserAcceptance(session);
} finally {
  await d1Query('DELETE FROM dev_parent_sessions WHERE session_hash=?1', [sessionHash]).catch(() => {});
}
