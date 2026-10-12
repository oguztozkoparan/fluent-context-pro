// Shared helpers for end-to-end tests and store screenshots: a tiny static server and a headless
// Chrome driven over the DevTools pipe (no npm dependencies).
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, ms = 5000, step = 100) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > ms) return null;
    await sleep(step);
  }
}

// ---------- Static server (fixtures). "{{PORT}}" in HTML is replaced with the server port. ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
export function startServer(root) {
  return new Promise((resolveServer) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      const file = normalize(join(root, decodeURIComponent(url.pathname)));
      if (!file.startsWith(normalize(root)) || !existsSync(file) || statSync(file).isDirectory()) {
        res.writeHead(404).end('not found');
        return;
      }
      let body = readFileSync(file);
      const type = TYPES[extname(file)] || 'application/octet-stream';
      if (type.startsWith('text/html')) body = Buffer.from(body.toString('utf8').replaceAll('{{PORT}}', String(server.address().port)));
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(body);
    });
    server.listen(0, '127.0.0.1', () => resolveServer({ port: server.address().port, close: () => server.close() }));
  });
}

// ---------- Chrome ----------
export function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = {
    win32: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
    linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  }[process.platform] || [];
  for (const c of candidates) if (existsSync(c)) return c;
  try { return execFileSync('which', ['google-chrome'], { encoding: 'utf8' }).trim(); } catch (e) { return null; }
}

export async function launchChrome({ extPath, width = 1280, height = 800 } = {}) {
  const chrome = findChrome();
  if (!chrome) throw new Error('Chrome not found. Set CHROME_PATH.');
  const profile = mkdtempSync(join(tmpdir(), 'fc-chrome-'));
  const args = [
    '--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging',
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', `--window-size=${width},${height}`,
    '--hide-scrollbars', '--force-color-profile=srgb', '--lang=en-US', 'about:blank'
  ];
  if (process.env.CI) args.unshift('--no-sandbox');
  const proc = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  const writer = proc.stdio[3];
  const reader = proc.stdio[4];
  let seq = 0;
  let buf = '';
  const pending = new Map();
  const listeners = new Set();
  reader.on('data', (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej, method } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(`${method}: ${msg.error.message}`)); else res(msg.result);
      } else listeners.forEach((l) => l(msg));
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej, method });
    writer.write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  });
  const onEvent = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  await send('Target.setDiscoverTargets', { discover: true });
  const { id: extId } = await send('Extensions.loadUnpacked', { path: resolve(extPath) });

  async function attach(targetId) {
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    return sessionId;
  }
  async function openPage(url) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const session = await attach(targetId);
    await send('Page.enable', {}, session);
    await send('Runtime.enable', {}, session);
    await send('DOM.enable', {}, session);
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, session);
    const loaded = new Promise((r) => { const off = onEvent((m) => { if (m.sessionId === session && m.method === 'Page.loadEventFired') { off(); r(); } }); });
    await send('Page.navigate', { url }, session);
    await Promise.race([loaded, sleep(8000)]);
    return { targetId, session };
  }
  async function serviceWorker() {
    const sw = await waitFor(async () => (await send('Target.getTargets')).targetInfos.find((t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${extId}/`)));
    if (!sw) throw new Error('Service worker did not start');
    const session = await attach(sw.targetId);
    await send('Runtime.enable', {}, session);
    return session;
  }
  async function close() {
    try { await send('Browser.close'); } catch (e) { /* already gone */ }
    await sleep(500);
    proc.kill();
    try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* locked on Windows */ }
  }
  return { send, onEvent, extId, attach, openPage, serviceWorker, close };
}

// ---------- Page helpers ----------
export async function evaluate(send, session, expression, contextId) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, contextId }, session);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
export async function mouse(send, session, x, y, { button = 'none', type = 'click' } = {}) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, session);
  if (type === 'move') return;
  const b = button === 'none' ? 'left' : button;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: b, clickCount: 1 }, session);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: b, clickCount: 1 }, session);
}
export async function key(send, session, name, code = 0) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: code }, session);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: code }, session);
}
export async function center(send, session, backendNodeId) {
  const { model } = await send('DOM.getBoxModel', { backendNodeId }, session);
  const q = model.border;
  return { x: (q[0] + q[4]) / 2, y: (q[1] + q[5]) / 2 };
}

// Reads the extension UI from inside its closed shadow root (DOM.getDocument pierces it).
export async function menuState(send, session) {
  const { root } = await send('DOM.getDocument', { depth: -1, pierce: true }, session);
  const cls = (n) => { const a = n.attributes || []; for (let i = 0; i < a.length; i += 2) if (a[i] === 'class') return a[i + 1]; return ''; };
  const text = (n) => { let s = ''; const w = (m) => { if (m.nodeType === 3) s += m.nodeValue; (m.children || []).forEach(w); (m.shadowRoots || []).forEach(w); }; w(n); return s.trim(); };
  const attr = (n, name) => { const a = n.attributes || []; for (let i = 0; i < a.length; i += 2) if (a[i] === name) return a[i + 1]; return null; };
  const menus = []; const toasts = []; const panels = [];
  const walk = (n, inHost) => {
    if (n.localName === 'fluent-context') inHost = true;
    const c = ` ${cls(n)} `;
    if (inHost && c.includes(' menu ') && !c.includes(' closing ')) menus.push({ rows: [], bars: [] });
    const cur = menus[menus.length - 1];
    if (inHost && cur && c.includes(' item ')) {
      let label = '';
      const w = (m) => { if (cls(m) === 'label') label = text(m); (m.children || []).forEach(w); };
      w(n);
      cur.rows.push({ label, backendNodeId: n.backendNodeId, disabled: attr(n, 'aria-disabled') === 'true', submenu: attr(n, 'aria-haspopup') === 'menu' });
    }
    if (inHost && cur && c.includes(' bar-btn ')) cur.bars.push({ label: attr(n, 'aria-label'), backendNodeId: n.backendNodeId, disabled: attr(n, 'disabled') !== null });
    if (inHost && c.includes(' toast ')) toasts.push(text(n));
    if (inHost && c.includes(' panel ')) panels.push(text(n));
    (n.children || []).forEach((k) => walk(k, inHost));
    (n.shadowRoots || []).forEach((k) => walk(k, inHost));
    if (n.contentDocument) walk(n.contentDocument, false);
  };
  walk(root, false);
  return { menus, toasts, panels };
}
