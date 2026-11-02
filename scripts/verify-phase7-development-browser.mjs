import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API = 'https://api.cloudflare.com/client/v4';
const D1_NAME = 'brick-family-v1-dev';
const ORIGIN = (process.env.BRICK_DEV_PARENT_ORIGIN || 'https://brick-family-v1-dev.lumjayvian.workers.dev').replace(/\/$/, '');
const token = process.env.CLOUDFLARE_API_TOKEN;
const explicitAccount = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required');

async function cf(apiPath, init = {}) {
  const response = await fetch(API + apiPath, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(`Cloudflare API ${response.status} for ${apiPath}: ${JSON.stringify(body.errors || body)}`);
  }
  return body.result;
}

async function selectAccount() {
  const accounts = await cf('/accounts?per_page=50');
  if (!Array.isArray(accounts) || accounts.length === 0) throw new Error('No Cloudflare account visible to token');
  if (explicitAccount) {
    const found = accounts.find(a => a.id === explicitAccount);
    if (!found) throw new Error('Requested CLOUDFLARE_ACCOUNT_ID is not visible to token');
    return found.id;
  }
  if (accounts.length !== 1) throw new Error(`Token can access ${accounts.length} accounts; set CLOUDFLARE_ACCOUNT_ID`);
  return accounts[0].id;
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

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
  if (lastError) throw new Error(`Timed out waiting for ${label}: ${lastError.message}`);
  throw new Error(`Timed out waiting for ${label}`);
}

class CdpClient {
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
    return new CdpClient(ws);
  }

  send(method, params = {}, sessionId = undefined) {
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

async function launchBrowser() {
  const chrome = findChrome();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brick-p7-chrome-'));
  const port = 9222;
  const child = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--use-gl=swiftshader',
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${userDataDir}`,
    '--window-size=1440,1100',
    'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let stderr = '';
  child.stderr.on('data', chunk => { stderr += String(chunk); if (stderr.length > 20_000) stderr = stderr.slice(-20_000); });

  const version = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`).catch(() => null);
    if (!response?.ok) return null;
    return response.json();
  }, { timeoutMs: 15_000, label: 'Chrome DevTools endpoint' }).catch(error => {
    child.kill('SIGKILL');
    throw new Error(`${error.message}\nChrome stderr:\n${stderr}`);
  });

  return { child, userDataDir, browserWs: version.webSocketDebuggerUrl, version, stderr: () => stderr };
}

async function browserAcceptance(session) {
  fs.mkdirSync('phase7-browser-evidence', { recursive: true });
  const browser = await launchBrowser();
  const cdp = await CdpClient.connect(browser.browserWs);
  let targetSession = null;
  const runtimeErrors = [];
  const consoleErrors = [];

  try {
    const created = await cdp.send('Target.createTarget', { url: 'about:blank', width: 1440, height: 1100 });
    const attached = await cdp.send('Target.attachToTarget', { targetId: created.targetId, flatten: true });
    targetSession = attached.sessionId;

    cdp.on(message => {
      if (message.sessionId !== targetSession) return;
      if (message.method === 'Runtime.exceptionThrown') {
        runtimeErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'runtime exception');
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
        const text = (message.params.args || []).map(x => x.value ?? x.description ?? '').join(' ');
        consoleErrors.push(text || 'console.error');
      }
      if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
        consoleErrors.push(message.params.entry.text || 'log error');
      }
    });

    await Promise.all([
      cdp.send('Page.enable', {}, targetSession),
      cdp.send('Runtime.enable', {}, targetSession),
      cdp.send('Network.enable', {}, targetSession),
      cdp.send('Log.enable', {}, targetSession)
    ]);

    await cdp.send('Network.setCookie', {
      name: 'brick_parent_dev', value: session, url: ORIGIN, secure: true, httpOnly: true, sameSite: 'Strict'
    }, targetSession);

    const evalValue = async expression => {
      const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, targetSession);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed');
      return result.result?.value;
    };

    const navigate = async url => {
      await cdp.send('Page.navigate', { url }, targetSession);
      await waitFor(async () => await evalValue('document.readyState === "complete"'), { timeoutMs: 25_000, label: `load ${url}` });
    };

    const screenshot = async name => {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }, targetSession);
      fs.writeFileSync(path.join('phase7-browser-evidence', name), Buffer.from(shot.data, 'base64'));
    };

    await navigate(`${ORIGIN}/parent`);
    await waitFor(async () => await evalValue("document.querySelectorAll('#devices option').length > 0"), { timeoutMs: 20_000, label: 'paired device list' });
    await waitFor(async () => {
      const text = await evalValue("document.querySelector('#portalLive')?.textContent || ''");
      return /PORTAL (LIVE|CONNECTING|RECONNECTING)/.test(text);
    }, { timeoutMs: 20_000, label: 'portal live state' });

    const header = await evalValue(`(() => ({
      title: document.title,
      badge: document.querySelector('.devBadge')?.textContent?.trim() || '',
      device: document.querySelector('#devices')?.selectedOptions?.[0]?.textContent?.trim() || '',
      tabs: [...document.querySelectorAll('.tabs button')].map(x => x.dataset.tab),
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth
    }))()`);
    assert.match(header.title, /Phase 7 Development/);
    assert.match(header.badge, /PHASE 7 BETA/);
    assert.ok(header.device && !/none/i.test(header.device), 'paired OPPO/device must be selected');
    assert.deepEqual(header.tabs, ['now', 'history', 'trips', 'places', 'health', 'debug']);
    assert.ok(header.scrollWidth <= header.width + 2, `desktop horizontal overflow: ${header.scrollWidth} > ${header.width}`);

    const tabResults = await evalValue(`(async()=>{const out=[];for(const name of ['now','history','trips','places','health','debug']){const b=document.querySelector('.tabs button[data-tab="'+name+'"]');b.click();await new Promise(r=>setTimeout(r,60));const pane=document.getElementById(name);out.push({name,buttonActive:b.classList.contains('active'),paneActive:pane?.classList.contains('active'),display:pane?getComputedStyle(pane).display:null})}return out})()`);
    for (const row of tabResults) {
      assert.equal(row.buttonActive, true, `${row.name} tab button did not activate`);
      assert.equal(row.paneActive, true, `${row.name} pane did not activate`);
      assert.notEqual(row.display, 'none', `${row.name} pane remained hidden`);
    }

    const portalContract = await evalValue(`(() => ({
      confidence: document.querySelector('#p7Confidence')?.textContent?.trim(),
      evidenceAge: document.querySelector('#p7EvidenceAge')?.textContent?.trim(),
      geometry: document.querySelector('#p7Geometry')?.textContent?.trim(),
      presentationSource: document.querySelector('#p7PresentationSource')?.textContent?.trim(),
      healthSummary: document.querySelector('#p7PositionHealthSummary')?.textContent?.trim(),
      providers: document.querySelector('#p7Providers')?.textContent?.trim(),
      gpsActual: document.querySelector('#gpsActual')?.textContent?.trim(),
      gpsAck: document.querySelector('#gpsAck')?.textContent?.trim(),
      gpsObserved: document.querySelector('#gpsObserved')?.textContent?.trim(),
      refinedToggle: !!document.querySelector('#historyRefinedToggle'),
      speedSelect: [...document.querySelectorAll('select')].some(s => ['0.5','1','2','5','10'].every(v => [...s.options].some(o => o.value===v))),
      mapFallback: (document.querySelector('#map')?.textContent || '').includes('Map unavailable on this browser'),
      mapCanvas: !!document.querySelector('#map canvas'),
      portalLive: document.querySelector('#portalLive')?.textContent?.trim() || ''
    }))()`);
    for (const [name, value] of Object.entries({ confidence: portalContract.confidence, evidenceAge: portalContract.evidenceAge, geometry: portalContract.geometry, presentationSource: portalContract.presentationSource, healthSummary: portalContract.healthSummary, providers: portalContract.providers, gpsActual: portalContract.gpsActual, gpsAck: portalContract.gpsAck, gpsObserved: portalContract.gpsObserved })) {
      assert.ok(value && value !== '—', `${name} was not rendered`);
    }
    assert.equal(portalContract.refinedToggle, true, 'refined-history toggle missing');
    assert.equal(portalContract.speedSelect, true, 'all five playback speeds not present');
    assert.ok(portalContract.mapFallback || portalContract.mapCanvas, 'map neither rendered nor entered explicit fallback');

    await evalValue("document.querySelector('.tabs button[data-tab=\"debug\"]')?.click();document.querySelector('#debugSelfCheck')?.click();true");
    const selfCheck = await waitFor(async () => {
      const text = await evalValue("document.querySelector('#debugCheckResult')?.textContent || ''");
      return /PASS:/.test(text) || /Attention:/.test(text) ? text : null;
    }, { timeoutMs: 20_000, label: 'portal self-check' });
    assert.match(selfCheck, /^PASS:/, `portal self-check failed: ${selfCheck}`);
    assert.match(selfCheck, /0 failed/);

    await screenshot('desktop.png');

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, targetSession);
    await sleep(500);
    const mobile = await evalValue(`(() => {
      const body = document.documentElement;
      const header = document.querySelector('header')?.getBoundingClientRect();
      const tabs = document.querySelector('.tabs')?.getBoundingClientRect();
      const visible = el => el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
      return {
        width: innerWidth, scrollWidth: body.scrollWidth,
        headerRight: header?.right ?? 9999, tabsRight: tabs?.right ?? 9999,
        historyToggle: visible(document.querySelector('#historyRefinedToggle')),
        gpsAck: !!document.querySelector('#gpsAck'),
        debug: !!document.querySelector('#debugSelfCheck')
      };
    })()`);
    assert.equal(mobile.width, 390);
    assert.ok(mobile.scrollWidth <= mobile.width + 2, `mobile page horizontal overflow: ${mobile.scrollWidth} > ${mobile.width}`);
    assert.ok(mobile.headerRight <= mobile.width + 2, `mobile header exceeds viewport: ${mobile.headerRight}`);
    assert.ok(mobile.tabsRight <= mobile.width + 2, `mobile tab container exceeds viewport: ${mobile.tabsRight}`);
    assert.equal(mobile.historyToggle, true, 'history refined control not reachable at mobile width');
    assert.equal(mobile.gpsAck, true, 'Location acknowledgement missing at mobile width');
    assert.equal(mobile.debug, true, 'Debug controls missing at mobile width');

    const mobileTabs = await evalValue(`(async()=>{const out=[];for(const name of ['now','history','trips','places','health','debug']){const b=document.querySelector('.tabs button[data-tab="'+name+'"]');b.scrollIntoView({block:'nearest',inline:'nearest'});b.click();await new Promise(r=>setTimeout(r,40));out.push(document.getElementById(name)?.classList.contains('active')===true)}return out})()`);
    assert.ok(mobileTabs.every(Boolean), 'one or more tabs failed at mobile width');
    await screenshot('mobile-390x844.png');

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, targetSession);
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: 'none' }, targetSession);
    await waitFor(async () => /OFFLINE/.test(await evalValue("document.querySelector('#portalLive')?.textContent || ''")), { timeoutMs: 10_000, label: 'offline portal state' });
    await sleep(1200);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: -1, uploadThroughput: -1, connectionType: 'wifi' }, targetSession);
    const recovered = await waitFor(async () => {
      const text = await evalValue("document.querySelector('#portalLive')?.textContent || ''");
      return /PORTAL LIVE/.test(text) ? text : null;
    }, { timeoutMs: 20_000, label: 'automatic WebSocket recovery after network restore' });
    assert.match(recovered, /PORTAL LIVE/);

    await evalValue("document.querySelector('.tabs button[data-tab=\"debug\"]')?.click();true");
    const networkState = await evalValue(`(() => ({
      live: document.querySelector('#portalLive')?.textContent || '',
      browser: document.querySelector('#debugBrowserNetwork')?.textContent || '',
      ws: document.querySelector('#debugWs')?.textContent || '',
      apiError: document.querySelector('#debugApiError')?.textContent || ''
    }))()`);
    assert.match(networkState.live, /LIVE/);
    assert.match(networkState.browser, /online/i);
    assert.match(networkState.ws, /live/i);

    await screenshot('desktop-after-reconnect.png');

    if (runtimeErrors.length) throw new Error(`Browser runtime exceptions:\n${runtimeErrors.join('\n---\n')}`);
    const actionableConsoleErrors = consoleErrors.filter(x => x && !/favicon|Failed to load resource.*404/i.test(x));
    if (actionableConsoleErrors.length) throw new Error(`Browser console/log errors:\n${actionableConsoleErrors.join('\n---\n')}`);

    const evidence = {
      origin: ORIGIN,
      chrome: browser.version.Browser,
      protocolVersion: browser.version['Protocol-Version'],
      desktop: { title: header.title, selectedDevice: header.device, live: portalContract.portalLive, selfCheck },
      mobile: { viewport: '390x844', horizontalOverflow: mobile.scrollWidth > mobile.width + 2 ? mobile.scrollWidth - mobile.width : 0 },
      reconnect: networkState,
      runtimeErrors,
      consoleErrors: actionableConsoleErrors,
      result: 'PASS',
      generatedAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join('phase7-browser-evidence', 'result.json'), JSON.stringify(evidence, null, 2));
    console.log(`Phase 7 live browser acceptance PASS on ${browser.version.Browser}`);
    console.log(`Selected device: ${header.device}`);
    console.log(`Portal self-check: ${selfCheck}`);
    console.log('Desktop + 390x844 responsive interaction PASS.');
    console.log('Offline -> automatic live WebSocket recovery PASS.');
  } finally {
    cdp.close();
    browser.child.kill('SIGTERM');
    await sleep(300);
    if (!browser.child.killed) browser.child.kill('SIGKILL');
    fs.rmSync(browser.userDataDir, { recursive: true, force: true });
  }
}

const accountId = await selectAccount();
const databases = await cf(`/accounts/${accountId}/d1/database?per_page=100`);
const db = Array.isArray(databases) ? databases.find(x => x.name === D1_NAME) : null;
if (!db?.uuid) throw new Error(`${D1_NAME} D1 database not found`);
async function d1Query(sql, params = []) {
  return cf(`/accounts/${accountId}/d1/database/${db.uuid}/query`, { method: 'POST', body: JSON.stringify({ sql, params }) });
}

const session = randomBytes(32).toString('base64url');
const sessionHash = sha256Hex(session);
const now = Date.now();
await d1Query('INSERT INTO dev_parent_sessions(session_hash,created_at,expires_at,revoked_at) VALUES(?1,?2,?3,NULL)', [sessionHash, now, now + 10 * 60_000]);
try {
  await browserAcceptance(session);
} finally {
  await d1Query('DELETE FROM dev_parent_sessions WHERE session_hash=?1', [sessionHash]).catch(() => {});
}
