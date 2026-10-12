// Generates store images from the real extension running in headless Chrome.
//   npm run screenshots           → docs/store/images/*.png
// Chrome Web Store: 1280×800 screenshots, 440×280 small promo tile, 1400×560 marquee.
// Edge and Firefox accept the same screenshots.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { center, evaluate, launchChrome, menuState, mouse, sleep, startServer } from '../tests/lib/browser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'store', 'images');
mkdirSync(out, { recursive: true });

const server = await startServer(root);
const base = `http://127.0.0.1:${server.port}`;
const browser = await launchChrome({ extPath: root, width: 1280, height: 800 });
const { send } = browser;

async function shot(session, name, clip) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }, session);
  writeFileSync(join(out, name), Buffer.from(data, 'base64'));
  console.log(`✓ docs/store/images/${name}`);
}
async function settings(sw, patch) {
  await evaluate(send, sw, `chrome.storage.sync.set(${JSON.stringify(patch)})`);
  await sleep(400);
}
async function hover(session, row) {
  const c = await center(send, session, row.backendNodeId);
  await mouse(send, session, c.x, c.y, { type: 'move' });
  await sleep(450);
}
const find = (menu, label) => {
  const row = menu && menu.rows.find((r) => r.label === label);
  if (!row) throw new Error(`"${label}" not found in ${JSON.stringify(menu && menu.rows.map((x) => x.label))}`);
  return row;
};

try {
  const sw = await browser.serviceWorker();
  await sleep(600);
  // Close the onboarding tab opened on install.
  for (const t of (await send('Target.getTargets')).targetInfos) if (t.url.includes('/popup/popup.html')) await send('Target.closeTarget', { targetId: t.targetId });

  const demo = await browser.openPage(`${base}/tests/e2e/fixtures/demo.html`);
  const s = demo.session;
  const rect = (id) => evaluate(send, s, `(() => { const r = document.getElementById('${id}').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);

  // 1 — Windows (Fluent), dark: selected text with the Text Tools submenu.
  await settings(sw, { platformStyle: 'windows', theme: 'dark', accentColor: '#0078d4', borderRadius: 8, blurVal: 24, bgOpacity: 0.82, density: 'normal', fontSize: 13, animStyle: 'none' });
  await evaluate(send, s, `(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('sel')); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
  // First line box of the selection (an inline element's bounding box can start outside it).
  let r = await evaluate(send, s, `(() => { const q = document.getElementById('sel').getClientRects()[0]; return { x: q.left, y: q.top, w: q.width, h: q.height }; })()`);
  await mouse(send, s, r.x + Math.min(80, r.w / 2), r.y + r.h / 2, { button: 'right' });
  await sleep(300);
  let st = await menuState(send, s);
  await hover(s, find(st.menus[0], 'Text Tools'));
  await shot(s, 'screenshot-1-windows.png');
  await mouse(send, s, 1200, 760);

  // 2 — macOS, light: link menu with "More Link Actions".
  await settings(sw, { platformStyle: 'macos', theme: 'light', accentColor: '#007aff', borderRadius: 10, blurVal: 30, bgOpacity: 0.74, density: 'compact' });
  await evaluate(send, s, `getSelection().removeAllRanges()`);
  r = await rect('lnk');
  await mouse(send, s, r.x + 60, r.y + r.h / 2, { button: 'right' });
  await sleep(300);
  st = await menuState(send, s);
  await hover(s, find(st.menus[0], 'More Link Actions'));
  st = await menuState(send, s);
  await hover(s, find(st.menus[1], 'Copy Clean Link'));
  await shot(s, 'screenshot-2-macos.png');
  await mouse(send, s, 1200, 760);

  // 3 — Linux (GNOME), dark: image menu with reverse image search.
  await settings(sw, { platformStyle: 'linux', theme: 'dark', accentColor: '#3584e4', borderRadius: 12, blurVal: 0, bgOpacity: 0.98, density: 'comfortable', fontSize: 14 });
  r = await rect('img');
  await mouse(send, s, r.x + r.w / 2, r.y + r.h / 2, { button: 'right' });
  await sleep(300);
  st = await menuState(send, s);
  await hover(s, find(st.menus[0], 'Search by Image'));
  await shot(s, 'screenshot-3-linux.png');
  await mouse(send, s, 1200, 760);

  // 4 — Settings page.
  await settings(sw, { platformStyle: 'windows', theme: 'light', accentColor: '#0078d4', borderRadius: 8, blurVal: 24, bgOpacity: 0.82, density: 'normal', fontSize: 13 });
  const page = await browser.openPage(`chrome-extension://${browser.extId}/popup/popup.html`);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, page.session);
  await evaluate(send, page.session, `document.body.style.background = 'linear-gradient(160deg, #e9eff9, #f6f1ea)'; document.querySelector('[data-tab=items]').click();`);
  await sleep(400);
  await shot(page.session, 'screenshot-4-settings.png');

  // Promo images.
  const promo = await browser.openPage(`${base}/docs/store/promo.html#small`);
  await send('Emulation.setDeviceMetricsOverride', { width: 440, height: 280, deviceScaleFactor: 1, mobile: false }, promo.session);
  await send('Page.reload', {}, promo.session);
  await sleep(600);
  await shot(promo.session, 'promo-small-440x280.png');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 560, deviceScaleFactor: 1, mobile: false }, promo.session);
  await send('Page.navigate', { url: `${base}/docs/store/promo.html` }, promo.session);
  await sleep(600);
  await shot(promo.session, 'promo-marquee-1400x560.png');
} finally {
  await browser.close();
  server.close();
}
