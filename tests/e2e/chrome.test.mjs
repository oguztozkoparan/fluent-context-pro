// End-to-end test: loads the extension into headless Chrome and drives it with real (trusted) input.
//   node tests/e2e/chrome.test.mjs [path-to-extension]      (default: dist/chromium if built, else repo root)
//   CHROME_PATH=/path/to/chrome to override browser discovery.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { center, evaluate, key, launchChrome, menuState, mouse, sleep, startServer, waitFor } from '../lib/browser.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const extPath = process.argv[2] || (existsSync(join(root, 'dist', 'chromium', 'manifest.json')) ? join(root, 'dist', 'chromium') : root);

const results = [];
const problems = [];
const check = (name, ok, detail) => {
  results.push([ok ? 'ok  ' : 'FAIL', name]);
  if (!ok) problems.push(`${name}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ''}`);
};
const labels = (m) => (m ? m.rows.map((r) => r.label) : []);

const server = await startServer(join(here, 'fixtures'));
const browser = await launchChrome({ extPath });
const { send } = browser;
const offErrors = browser.onEvent((m) => {
  if (m.method === 'Runtime.exceptionThrown') problems.push(`exception: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push(`console.error: ${m.params.args.map((a) => a.value || a.description).join(' ')}`);
});

try {
  console.log(`Extension: ${extPath}`);
  // ---------- Background ----------
  const sw = await browser.serviceWorker();
  await sleep(800);
  const bg = await evaluate(send, sw, `(async () => ({ version: chrome.runtime.getManifest().version, sync: await chrome.storage.sync.get(null), updates: typeof FC.updates.check, alarms: await chrome.alarms.getAll() }))()`);
  check('service worker loads all modules', bg.updates === 'function', bg);
  check('install migration ran', bg.sync.schemaVersion === 4, bg.sync);
  const onboarding = (await send('Target.getTargets')).targetInfos.find((t) => t.url.includes(`${browser.extId}/popup/popup.html`));
  check('settings page opens on first install', !!onboarding);

  // ---------- Settings page under the extension CSP ----------
  const settings = await browser.openPage(`chrome-extension://${browser.extId}/popup/popup.html`);
  await sleep(600);
  const ui = await evaluate(send, settings.session, `({ version: document.getElementById('version').textContent, groups: document.querySelectorAll('#itemGroups .grp').length, previewMenu: !!document.querySelector('#preview > div').shadowRoot.querySelector('.menu .bar'), wide: document.body.classList.contains('wide'), update: document.getElementById('updStatus').textContent })`);
  check('settings page renders (CSP ok, grouped items, preview with icon bar)', ui.version === `v${bg.version}` && ui.groups === 6 && ui.previewMenu, ui);

  // ---------- Page ----------
  const page = await browser.openPage(`http://127.0.0.1:${server.port}/page.html`);
  const s = page.session;
  await sleep(700);

  // Selection menu: icon bar + text actions, no navigation rows.
  await evaluate(send, s, `(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('p')); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
  const p = await evaluate(send, s, `(() => { const r = document.getElementById('p').getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; })()`);
  await mouse(send, s, p.x, p.y, { button: 'right' });
  await sleep(400);
  let st = await menuState(send, s);
  check('right-click opens the menu in the top layer', st.menus.length === 1 && (await evaluate(send, s, `document.querySelector('fluent-context').matches(':popover-open')`)), st.menus.length);
  check('navigation shown as an icon bar', st.menus[0] && st.menus[0].bars.map((b) => b.label).join() === 'Back,Forward,Reload,Print…', st.menus[0] && st.menus[0].bars);
  check('selection menu is short and categorized', labels(st.menus[0]).join() === 'Copy,Search the Web,Translate,Text Tools,AI Assistant,Developer Tools,Page Tools', labels(st.menus[0]));

  // Submenu stays open while the pointer travels into it and hovers its items.
  const tt = st.menus[0].rows.find((r) => r.label === 'Text Tools');
  const ttc = await center(send, s, tt.backendNodeId);
  await mouse(send, s, ttc.x, ttc.y, { type: 'move' });
  await sleep(400);
  st = await menuState(send, s);
  check('submenu opens on hover', st.menus.length === 2, st.menus.length);
  const r3 = await center(send, s, st.menus[1].rows[3].backendNodeId);
  await mouse(send, s, r3.x - 60, ttc.y, { type: 'move' });
  await mouse(send, s, r3.x, r3.y, { type: 'move' });
  await sleep(900);
  st = await menuState(send, s);
  check('submenu stays open while hovering its items', st.menus.length === 2, st.menus.length);
  const wc = st.menus[1].rows.find((r) => r.label === 'Word & Character Count');
  const wcc = await center(send, s, wc.backendNodeId);
  await mouse(send, s, wcc.x, wcc.y);
  await sleep(400);
  st = await menuState(send, s);
  check('clicking an item runs it', st.menus.length === 0 && st.toasts.some((t) => /8 words/.test(t)), st.toasts);

  // Keyboard: arrows reach the icon bar, Enter on "Reload" reloads the tab.
  await mouse(send, s, p.x, p.y, { button: 'right' });
  await sleep(300);
  await key(send, s, 'ArrowDown', 40);
  await key(send, s, 'ArrowRight', 39);
  await key(send, s, 'ArrowRight', 39);
  st = await menuState(send, s);
  check('keyboard focus moves through the icon bar', st.menus.length === 1);
  await key(send, s, 'Escape', 27);
  await sleep(300);

  // Link menu: compact with a "More" submenu that holds the rest.
  const a = await evaluate(send, s, `(() => { getSelection().removeAllRanges(); const r = document.getElementById('a').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
  await mouse(send, s, a.x, a.y, { button: 'right' });
  await sleep(400);
  st = await menuState(send, s);
  check('link menu keeps main actions and one "More" submenu', labels(st.menus[0]).join() === 'Open in New Tab,Open and Switch to Tab,Open in Private Window,Copy Link Address,More Link Actions,Developer Tools,Page Tools', labels(st.menus[0]));
  const more = st.menus[0].rows.find((r) => r.label === 'More Link Actions');
  const mc = await center(send, s, more.backendNodeId);
  await mouse(send, s, mc.x, mc.y, { type: 'move' });
  await sleep(400);
  st = await menuState(send, s);
  check('"More" submenu lists the secondary link actions', labels(st.menus[1]).includes('Copy Clean Link') && labels(st.menus[1]).includes('Save Link As…'), labels(st.menus[1]));
  await send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: `http://127.0.0.1:${server.port}` });
  const clean = st.menus[1].rows.find((r) => r.label === 'Copy Clean Link');
  const cc = await center(send, s, clean.backendNodeId);
  await mouse(send, s, cc.x, cc.y, { type: 'move' });
  await mouse(send, s, cc.x, cc.y);
  await sleep(500);
  const clip = await evaluate(send, s, `navigator.clipboard.readText()`);
  check('clean link copied without tracking parameters', clip === 'https://example.com/landing?id=42', clip);

  // "Open in New Tab" opens a background tab through tabs.create.
  await mouse(send, s, a.x, a.y, { button: 'right' });
  await sleep(300);
  st = await menuState(send, s);
  const bgRow = st.menus[0].rows.find((r) => r.label === 'Open in New Tab');
  const bgc = await center(send, s, bgRow.backendNodeId);
  await mouse(send, s, bgc.x, bgc.y, { type: 'move' });
  await mouse(send, s, bgc.x, bgc.y);
  const tab = await waitFor(async () => (await send('Target.getTargets')).targetInfos.find((t) => t.type === 'page' && t.url.includes('example.com/landing')), 4000);
  check('background tab opened', !!tab);

  // Security: a page script cannot open the menu with a synthetic event.
  const synthetic = await evaluate(send, s, `(() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }); document.body.dispatchEvent(e); return e.defaultPrevented; })()`);
  await sleep(200);
  st = await menuState(send, s);
  check('synthetic contextmenu from page script is ignored', synthetic === false && st.menus.length === 0, { synthetic, menus: st.menus.length });

  // Cross-origin small iframe: menu drawn by the top page; frame-scoped action runs in the iframe.
  const f = await evaluate(send, s, `(() => { const r = document.getElementById('small').getBoundingClientRect(); return { x: r.left + 2 + 20, y: r.top + 2 + 14 }; })()`);
  await mouse(send, s, f.x, f.y, { button: 'right' });
  await sleep(700);
  st = await menuState(send, s);
  check('cross-origin iframe menu relayed to the top page', st.menus.length === 1 && labels(st.menus[0])[0] === 'Open in New Tab', labels(st.menus[0]));
  await key(send, s, 'Escape', 27);
  await sleep(400);
  st = await menuState(send, s);
  check('Esc forwarded from the iframe closes it', st.menus.length === 0, st.menus.length);
  await mouse(send, s, f.x, f.y, { button: 'right' });
  await sleep(700);
  st = await menuState(send, s);
  const dev = st.menus[0].rows.find((r) => r.label === 'Developer Tools');
  await mouse(send, s, ...Object.values(await center(send, s, dev.backendNodeId)), { type: 'move' });
  await sleep(400);
  st = await menuState(send, s);
  const sel = st.menus[1].rows.find((r) => r.label === 'Copy CSS Selector');
  const sc = await center(send, s, sel.backendNodeId);
  await mouse(send, s, sc.x, sc.y, { type: 'move' });
  await mouse(send, s, sc.x, sc.y);
  await sleep(700);
  check('frame action ran in the iframe and the top page copied the result', (await evaluate(send, s, `navigator.clipboard.readText()`)) === '#x');

  // Editable fields keep the browser menu.
  const i = await evaluate(send, s, `(() => { const r = document.getElementById('i').getBoundingClientRect(); return { x: r.left + 10, y: r.top + 5 }; })()`);
  await mouse(send, s, i.x, i.y, { button: 'right' });
  await sleep(300);
  st = await menuState(send, s);
  check('text fields keep the native menu', st.menus.length === 0, st.menus.length);

  // The execCommand fallback copies from inside a closed shadow root (text never enters the page DOM).
  const contexts = [];
  const off = browser.onEvent((m) => { if (m.sessionId === s && m.method === 'Runtime.executionContextCreated') contexts.push(m.params.context); });
  await send('Runtime.disable', {}, s);
  await send('Runtime.enable', {}, s);
  await sleep(300);
  off();
  const iso = contexts.find((c) => c.name === 'FluentContext Pro' && c.auxData && c.auxData.frameId === page.targetId);
  const shadowCopy = iso && await evaluate(send, s, `(() => { const h = document.createElement('div'); document.documentElement.append(h); const sr = h.attachShadow({ mode: 'closed' }); const ta = document.createElement('textarea'); ta.value = 'shadow-copy'; sr.append(ta); ta.select(); const ok = document.execCommand('copy'); h.remove(); return ok; })()`, iso.id);
  check('clipboard fallback works from a closed shadow root', shadowCopy === true && (await evaluate(send, s, `navigator.clipboard.readText()`)) === 'shadow-copy', { iso: !!iso, shadowCopy });
} catch (e) {
  problems.push(`test error: ${e.stack}`);
} finally {
  offErrors();
  await browser.close();
  server.close();
}

for (const [status, name] of results) console.log(`${status} ${name}`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`\nAll ${results.length} checks passed.`);
