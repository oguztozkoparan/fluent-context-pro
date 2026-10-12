const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
// Unit tests for the pure modules and the background worker (no browser, no dependencies).
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const deq = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);
const test = async (name, fn) => { try { await fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message.split('\n').slice(0, 6).join(' '), '\n   ', (e.stack.split('\n').find((l) => l.includes('unit.test.js')) || '').trim()); } };

// ---- fake browser environment ----
function makeStorage() {
  const areas = { local: {}, sync: {} }; const listeners = [];
  const area = (n) => ({
    get: async (keys) => {
      const a = areas[n]; if (keys == null) return structuredClone(a);
      const ks = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const o = {}; ks.forEach((k) => { if (k in a) o[k] = structuredClone(a[k]); }); return o;
    },
    set: async (obj) => { const ch = {}; for (const [k, v] of Object.entries(obj)) { ch[k] = { oldValue: areas[n][k], newValue: v }; areas[n][k] = structuredClone(v); } listeners.forEach((l) => l(ch, n)); },
    remove: async (keys) => { [].concat(keys).forEach((k) => delete areas[n][k]); },
    clear: async () => { areas[n] = {}; }
  });
  return { areas, api: { local: area('local'), sync: area('sync'), onChanged: { addListener: (f) => listeners.push(f) } } };
}
function boot(opts = {}) {
  const g = {
    navigator: { userAgent: opts.ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140', platform: opts.platform || 'Win32', languages: opts.languages || ['tr-TR', 'en'], maxTouchPoints: 0 },
    crypto: globalThis.crypto, TextEncoder, TextDecoder, Intl, URL, Blob, Response, btoa, atob, console, setTimeout, clearTimeout,
    DecompressionStream, structuredClone
  };
  g.self = g;
  const st = makeStorage();
  g.chrome = { storage: st.api, runtime: { id: 'x', onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onConnect: { addListener() {} } } };
  const ctx = vm.createContext(g);
  const load = (f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  ['src/build-info.js', 'src/platform.js', 'src/util.js', 'src/i18n/i18n.js', 'src/i18n/menu.js', 'src/i18n/popup.js', 'src/icons.js', 'src/items.js', 'src/config.js', 'src/updates.js'].forEach(load);
  return { g, FC: g.FC, st, load };
}

(async () => {
  const { FC } = boot();
  const U = FC.util, D = FC.i18n._dicts;

  await test('i18n: all languages have every English key', () => {
    const en = Object.keys(D.en);
    for (const [code, d] of Object.entries(D)) {
      const miss = en.filter((k) => !(k in d)); const extra = Object.keys(d).filter((k) => !(k in D.en));
      deq([miss, extra], [[], []], code);
    }
    assert.strictEqual(Object.keys(D).length, 6);
  });
  await test('i18n: placeholders match English', () => {
    const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    for (const [code, d] of Object.entries(D)) for (const k of Object.keys(D.en)) assert.strictEqual(vars(d[k]), vars(D.en[k]), `${code}.${k}`);
  });
  const items = FC.buildItems({ icons: FC.icons, keys: FC.platform.keys });
  await test('items: unique ids, labels, icons, groups', () => {
    const seen = new Set(); const missing = []; const noIcon = [];
    U.walkItems(items, (it) => {
      assert(!seen.has(it.id), 'dup ' + it.id); seen.add(it.id);
      if (!it.raw && typeof it.label !== 'function' && !(it.id in D.en)) missing.push(it.id);
      if (!it.raw && !it.icon) noIcon.push(it.id);
    });
    deq(missing, []); deq(noIcon, []);
    items.forEach((it) => assert(it.group, 'root without group ' + it.id));
  });
  await test('code: every t() key used in sources and HTML exists', () => {
    const used = new Set();
    for (const f of ['src/items.js', 'src/content/main.js', 'src/content/host.js', 'popup/popup.js']) {
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
      for (const m of s.matchAll(/\bt\('([A-Za-z_]+)'/g)) used.add(m[1]);
      for (const m of s.matchAll(/'([A-Za-z_]+)' : '([A-Za-z_]+)'/g)) { used.add(m[1]); used.add(m[2]); }
    }
    const html = fs.readFileSync(path.join(ROOT, 'popup/popup.html'), 'utf8');
    for (const m of html.matchAll(/data-i18n(?:-title|-placeholder)?="([A-Za-z_]+)"/g)) used.add(m[1]);
    const ignore = new Set(['url', 'ai', 'none', 'scale', 'slide', 'fade', 'success', 'error', 'info', 'dark', 'light', 'change', 'input', 'more', 'main', 'popup', 'wide']);
    const miss = [...used].filter((k) => !ignore.has(k) && !(k in D.en)); deq(miss, [], 'missing: ' + miss.join(', '));
  });
  await test('i18n: resolves system language, falls back to English', () => {
    assert.strictEqual(FC.i18n.resolve('auto'), 'tr');
    assert.strictEqual(boot({ languages: ['ja-JP', 'ko'] }).FC.i18n.resolve('auto'), 'en');
    assert.strictEqual(boot({ languages: ['de-AT'] }).FC.i18n.resolve('auto'), 'de');
    assert.strictEqual(FC.i18n.resolve('fr'), 'fr');
    assert.strictEqual(FC.i18n.resolve('xx'), 'tr');
  });
  await test('platform: OS detection, variant and shortcut labels', () => {
    assert.strictEqual(FC.platform.variant, 'windows'); assert.strictEqual(FC.platform.keys.copy, 'Ctrl+C');
    const mac = boot({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605 Version/17 Safari/605', platform: 'MacIntel' }).FC.platform;
    assert.strictEqual(mac.variant, 'macos'); assert.strictEqual(mac.keys.copy, '⌘C'); assert.strictEqual(mac.browser, 'safari');
    const lin = boot({ ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0', platform: 'Linux x86_64' }).FC.platform;
    assert.strictEqual(lin.variant, 'linux'); assert.strictEqual(lin.browser, 'firefox'); assert.strictEqual(lin.keys.back, 'Alt+←');
    assert.strictEqual(boot({ ua: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/140', platform: 'Linux x86_64' }).FC.platform.os, 'chromeos');
    assert.strictEqual(boot({ ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140 Safari/537.36 Edg/140.0' }).FC.platform.browser, 'edge');
    assert.strictEqual(boot({ ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/140 Mobile', platform: 'Linux armv8l' }).FC.platform.os, 'android');
  });

  await test('util.cleanUrl', () => {
    const c = U.cleanUrl;
    assert.strictEqual(c('https://ex.com/a?utm_source=x&id=5&fbclid=abc#h'), 'https://ex.com/a?id=5#h');
    assert.strictEqual(c('https://ex.com/a?id=5'), 'https://ex.com/a?id=5');
    assert.strictEqual(c('https://ex.com/a?q=a%20b&x=1'), 'https://ex.com/a?q=a%20b&x=1');
    assert.strictEqual(c('https://www.google.com/url?q=https%3A%2F%2Fsite.org%2Fp%3Futm_medium%3Dx%26k%3D1&sa=D'), 'https://site.org/p?k=1');
    assert.strictEqual(c('https://youtu.be/abc?si=XYZ&t=30'), 'https://youtu.be/abc?t=30');
    assert.strictEqual(c('https://l.facebook.com/l.php?u=https%3A%2F%2Fa.com%2F&h=AT'), 'https://a.com/');
    assert.strictEqual(c('https://other.com/p?si=keep'), 'https://other.com/p?si=keep');
    assert.strictEqual(c('https://www.amazon.com.tr/dp/B0X?ref=abc&tag=aff-21&psc=1'), 'https://www.amazon.com.tr/dp/B0X?psc=1');
    assert.strictEqual(c('mailto:a@b.c'), 'mailto:a@b.c');
  });
  await test('util: templates, hosts, order, separators, text', () => {
    assert.strictEqual(U.fillTemplate('https://s.com/?q=%s&r=%raw', 'a b%s'), 'https://s.com/?q=a%20b%25s&r=a b%s');
    assert(U.validTemplate('https://s.com/?q=%s')); assert(!U.validTemplate('javascript:alert(%s)')); assert(!U.validTemplate('ftp://x/%s'));
    assert.strictEqual(U.fillPrompt('Fix: %s', 'abc'), 'Fix: abc'); assert.strictEqual(U.fillPrompt('Fix', 'abc'), 'Fix\n\nabc');
    assert(U.hostMatches(['figma.com'], 'www.figma.com')); assert(U.hostMatches(['https://www.figma.com/file/x'], 'figma.com'));
    assert(!U.hostMatches(['figma.com'], 'notfigma.com')); assert(U.hostMatches(['*.example.org'], 'a.b.example.org'));
    const A = [{ id: 'a' }, { id: 'b' }, { id: 'new' }, { id: 'c' }];
    deq(U.applyOrder(A, ['c', 'b', 'a']).map((x) => x.id), ['c', 'b', 'new', 'a']);
    deq(U.applyOrder(A, []).map((x) => x.id), ['a', 'b', 'new', 'c']);
    deq(U.applyOrder(A, ['gone', 'c']).map((x) => x.id), ['a', 'b', 'new', 'c']);
    deq(U.applyOrder(A, ['b', 'c', 'a']).map((x) => x.id), ['b', 'new', 'c', 'a']);
    const S = { type: 'separator' };
    deq(U.cleanSeparators([S, { id: 1 }, S, S, { id: 2 }, S]).map((x) => x.type || x.id), [1, 'separator', 2]);
    assert.strictEqual(U.titleCase('istanbul ılık ŞEHİR', 'tr'), 'İstanbul Ilık Şehir');
    assert.strictEqual(U.wordCount('Merhaba dünya, nasılsın?', 'tr'), 3);
    assert.strictEqual(U.charCount('👍a'), 2);
    assert.strictEqual(U.safeFilename('a/b:c?.png'), 'a_b_c_.png');
    assert.strictEqual(U.filenameFromUrl('https://x.com/p/%C3%A7i%C3%A7ek.jpg?x=1'), 'çiçek.jpg');
    assert.strictEqual(U.filenameFromUrl('https://x.com/p/'), '');
    assert.strictEqual(U.mdEscape('a [b] c'), 'a \\[b\\] c');
  });
  await test('util: png text chunks (tEXt, iTXt, zTXt) and base64 round trip', async () => {
    const zlib = require('zlib');
    const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); return b; };
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('tEXt', Buffer.from('prompt\0{"a":1}', 'latin1')),
      chunk('iTXt', Buffer.concat([Buffer.from('workflow\0\0\0\0\0', 'latin1'), Buffer.from('çalışma', 'utf8')])),
      chunk('zTXt', Buffer.concat([Buffer.from('parameters\0\0', 'latin1'), zlib.deflateSync(Buffer.from('steps: 20', 'latin1'))])),
      chunk('IEND', Buffer.alloc(0))
    ]);
    const out = await U.pngTextChunks(new Uint8Array(png));
    deq(out, [{ key: 'prompt', text: '{"a":1}' }, { key: 'workflow', text: 'çalışma' }, { key: 'parameters', text: 'steps: 20' }]);
    assert.strictEqual(await U.pngTextChunks(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])), null);
    const url = await U.blobToDataUrl(new Blob([new Uint8Array([0, 255, 10, 20])], { type: 'image/x-test' }));
    assert.strictEqual(url, 'data:image/x-test;base64,AP8KFA==');
    deq([...new Uint8Array(await U.dataUrlToBlob(url).arrayBuffer())], [0, 255, 10, 20]);
  });

  await test('config: defaults follow the platform; default-off comes from items', () => {
    const d = FC.config.defaults();
    assert.strictEqual(d.accentColor, '#0078d4'); assert.strictEqual(d.borderRadius, 8); assert.strictEqual(d.theme, 'auto');
    deq(d.disabledItems.slice().sort(), ['clearStorage', 'copyImageBase64', 'copyMeta', 'hideElement', 'imageInfo', 'removeElement', 'viewSource']);
    const mac = boot({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Chrome/140', platform: 'MacIntel' }).FC.config.defaults();
    assert.strictEqual(mac.accentColor, '#007aff'); assert.strictEqual(mac.density, 'compact');
  });
  await test('config.sanitize: upgrades v5 settings and rejects junk', () => {
    const s = FC.config.sanitize({
      bgOpacity: '0.75', blurVal: '24px', fontFamily: '"Segoe UI", system-ui, sans-serif', theme: 'dark', animDuration: 9999, accentColor: 'red',
      customItems: [{ label: 'GH', url: 'https://github.com/search?q=%s' }, { label: 'bad', url: 'javascript:x' }, { type: 'ai', label: 'Polite', template: 'Be polite: %s' }],
      blockedSites: ['https://www.Figma.com/x', '', 3], disabledItems: ['savePdf', 'copy', 'copy'], language: 'zz-top', unknownKey: 1
    });
    assert.strictEqual(s.bgOpacity, 0.75); assert.strictEqual(s.blurVal, 24); assert.strictEqual(s.fontFamily, 'system'); assert.strictEqual(s.theme, 'dark');
    assert.strictEqual(s.animDuration, 600); assert.strictEqual(s.accentColor, '#0078d4'); assert.strictEqual(s.language, 'auto');
    deq(s.customItems, [{ type: 'url', label: 'GH', template: 'https://github.com/search?q=%s' }, { type: 'ai', label: 'Polite', template: 'Be polite: %s' }]);
    deq(s.blockedSites, ['figma.com']); deq(s.disabledItems, ['savePdf', 'copy']);
    assert(!('unknownKey' in s));
  });
  await test('config: migrate moves v5 local settings to sync, keeps secrets local', async () => {
    const b = boot();
    b.st.areas.local = { bgOpacity: '0.6', disabledItems: ['savePdf', 'print'], ocrKey: 'SECRET', customItems: [{ label: 'x', url: 'https://x.com/?q=%s' }] };
    await b.FC.config.migrate();
    deq(Object.keys(b.st.areas.local), ['ocrKey']);
    assert.strictEqual(b.st.areas.sync.bgOpacity, '0.6'); assert.strictEqual(b.st.areas.sync.schemaVersion, 4);
    const dis = b.st.areas.sync.disabledItems;
    assert(dis.includes('print') && dis.includes('imageInfo') && !dis.includes('savePdf'), JSON.stringify(dis));
    const cfg = await b.FC.config.load();
    assert.strictEqual(cfg.bgOpacity, 0.6); assert.strictEqual(cfg.ocrKey, 'SECRET'); assert.strictEqual(cfg.customItems[0].template, 'https://x.com/?q=%s');
    await b.FC.config.migrate();
    deq(Object.keys(b.st.areas.local), ['ocrKey']);
  });
  await test('config: migrate folds "Open in Background Tab" into "Open in New Tab" without re-disabling items', async () => {
    const b = boot();
    b.st.areas.sync = { schemaVersion: 3, disabledItems: ['openBackground'], pinnedItems: ['openBackground', 'openLink', 'copy'], itemOrder: ['copy', 'openBackground', 'openLink'] };
    await b.FC.config.migrate();
    const s = b.st.areas.sync;
    assert.strictEqual(s.schemaVersion, 4);
    deq(s.disabledItems, []); deq(s.pinnedItems, ['openLink', 'copy']); deq(s.itemOrder, ['copy', 'openLink']);
  });
  await test('config: save routes secrets to local; reset keeps secrets', async () => {
    const b = boot();
    await b.FC.config.save({ llmKey: 'K', theme: 'light' });
    assert.strictEqual(b.st.areas.local.llmKey, 'K'); assert.strictEqual(b.st.areas.sync.theme, 'light'); assert(!('llmKey' in b.st.areas.sync));
    await b.FC.config.reset();
    const cfg = await b.FC.config.load(); assert.strictEqual(cfg.theme, 'auto'); assert.strictEqual(cfg.llmKey, 'K');
  });
  await test('config.exportable strips secrets', () => {
    const e = FC.config.exportable({ ...FC.config.defaults(), llmKey: 'a', ocrKey: 'b' });
    assert(!('llmKey' in e.settings) && !('ocrKey' in e.settings) && e.app === 'FluentContext Pro');
  });

  await test('background: SSE stream, JSON fallback, errors, auth header, message handlers', async () => {
    const b = boot();
    let connectCb, msgCb;
    b.g.chrome.runtime.onConnect = { addListener: (f) => { connectCb = f; } };
    b.g.chrome.runtime.onMessage = { addListener: (f) => { msgCb = f; } };
    b.g.chrome.runtime.getPlatformInfo = () => Promise.resolve({});
    b.g.chrome.tabs = {};
    Object.assign(b.g, { setInterval, clearInterval, AbortController, FormData });
    const respond = (body, type, status = 200) => async () => new Response(body, { status, headers: { 'content-type': type } });
    const runPort = (fetchImpl, msg) => new Promise((resolve) => {
      b.g.fetch = fetchImpl; const out = [];
      connectCb({
        name: 'fc-llm',
        postMessage: (m) => { out.push(m); if (m.done || m.error) resolve(out); },
        onDisconnect: { addListener() {} },
        onMessage: { addListener: (f) => setTimeout(() => f(msg)) }
      });
    });
    b.load('background.js');
    const sse = 'data: {"choices":[{"delta":{"content":"Mer"}}]}\n\ndata: {"choices":[{"delta":{"content":"haba"}}]}\n\ndata: [DONE]\n\n';
    deq(await runPort(respond(sse, 'text/event-stream; charset=utf-8'), { url: 'http://x', prompt: 'p', stream: true }), [{ delta: 'Mer' }, { delta: 'haba' }, { done: true }]);
    deq(await runPort(respond(JSON.stringify({ choices: [{ message: { content: 'Tamam' } }] }), 'application/json'), { url: 'http://x', prompt: 'p', stream: true }), [{ delta: 'Tamam' }, { done: true }]);
    const err = await runPort(respond('nope', 'text/plain', 401), { url: 'http://x', prompt: 'p' });
    assert(err[0].error.startsWith('HTTP 401'), err[0].error);
    let seen;
    await runPort(async (u, o) => { seen = o; return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { headers: { 'content-type': 'application/json' } }); }, { url: 'https://x.example', prompt: 'p', key: 'sk-1', model: 'm1', stream: false });
    assert.strictEqual(seen.headers.Authorization, 'Bearer sk-1'); assert.strictEqual(JSON.parse(seen.body).model, 'm1');
    assert.strictEqual(msgCb({ type: 'NOPE' }, {}, () => {}), false);
    deq(await new Promise((res) => msgCb({ type: 'TAB_INFO' }, { tab: { url: 'https://a.b/', title: 'T' } }, res)), { ok: true, result: { url: 'https://a.b/', title: 'T' } });
    assert.strictEqual((await new Promise((res) => msgCb({ type: 'FETCH_DATA_URL', url: 'file:///etc/passwd' }, {}, res))).ok, false);
    assert.strictEqual((await new Promise((res) => msgCb({ type: 'SCREENSHOT' }, {}, res))).error, 'No tab');
  });


  await test('util: private hosts and version comparison', () => {
    ['localhost', '127.0.0.1', '192.168.1.20', '10.0.0.5', '172.20.1.1', 'my-nas.local', '[::1]', 'app.localhost'].forEach((h) => assert(U.isPrivateHost(h), h));
    ['example.com', '8.8.8.8', '172.32.0.1', 'api.openai.com', 'localhost.evil.com'].forEach((h) => assert(!U.isPrivateHost(h), h));
    assert.strictEqual(U.compareVersions('6.10.0', '6.9.9'), 1);
    assert.strictEqual(U.compareVersions('6.1', '6.1.0'), 0);
    assert.strictEqual(U.compareVersions('6.1.0', '6.2.0'), -1);
  });

  await test('updates: channel detection, GitHub release check, badge, what\'s new', async () => {
    const b = boot();
    let badge = '';
    b.g.chrome.runtime.getManifest = () => ({ version: '6.1.0' });
    b.g.chrome.runtime.openOptionsPage = async () => {};
    b.g.chrome.action = { setBadgeText: async ({ text }) => { badge = text; }, setBadgeBackgroundColor: async () => {} };
    b.g.chrome.management = { getSelf: async () => ({ installType: 'development' }) };
    assert.strictEqual(await b.FC.updates.channel(), 'none');
    b.FC.build.repo = 'owner/fluentcontext';
    assert.strictEqual(await b.FC.updates.channel(), 'github');
    let asked = '';
    b.g.fetch = async (url) => { asked = url; return new Response(JSON.stringify({ tag_name: 'v6.2.0', html_url: 'https://github.com/owner/fluentcontext/releases/tag/v6.2.0' })); };
    const info = await b.FC.updates.check();
    assert.strictEqual(asked, 'https://api.github.com/repos/owner/fluentcontext/releases/latest');
    assert.strictEqual(info.status, 'available'); assert.strictEqual(info.latest, '6.2.0'); assert.strictEqual(badge, '↑');
    b.g.fetch = async () => new Response(JSON.stringify({ tag_name: 'v6.0.0', html_url: 'javascript:alert(1)' }));
    const older = await b.FC.updates.check();
    assert.strictEqual(older.status, 'current'); assert(older.url.startsWith('https://github.com/owner/'), older.url); assert.strictEqual(badge, '');
    b.g.fetch = async () => new Response(JSON.stringify({ tag_name: 'nightly' }));
    await assert.rejects(b.FC.updates.check(), /Unexpected release tag/);
    b.g.fetch = async () => new Response('{}', { status: 404 });
    assert.strictEqual((await b.FC.updates.check()).status, 'unpublished');
    b.g.chrome.management.getSelf = async () => ({ installType: 'normal' });
    assert.strictEqual(await b.FC.updates.channel(), 'store');
    await b.FC.updates.onInstalled({ reason: 'update', previousVersion: '6.0.0' });
    deq((await b.FC.updates.status()).whatsNew, { version: '6.1.0', previous: '6.0.0' });
    assert.strictEqual(badge, 'NEW');
    await b.FC.updates.seen();
    assert.strictEqual((await b.FC.updates.status()).whatsNew, null); assert.strictEqual(badge, '');
  });

  await test('background: rejects unsafe URLs and plain-HTTP API keys', async () => {
    const b = boot();
    let msgCb, connectCb;
    const downloads = [];
    b.g.chrome.runtime.onMessage = { addListener: (f) => { msgCb = f; } };
    b.g.chrome.runtime.onConnect = { addListener: (f) => { connectCb = f; } };
    b.g.chrome.runtime.getPlatformInfo = () => Promise.resolve({});
    b.g.chrome.tabs = { create: async (o) => o };
    b.g.chrome.downloads = { download: async (o) => { downloads.push(o); return 1; } };
    Object.assign(b.g, { setInterval, clearInterval, AbortController, FormData });
    b.load('background.js');
    const call = (m, s = { tab: { id: 1, index: 0, windowId: 1 } }) => new Promise((res) => msgCb(m, s, res));
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'chrome://settings', 'file:///C:/x', 'view-source:javascript:1']) {
      assert.strictEqual((await call({ type: 'OPEN_TAB', url })).ok, false, url);
    }
    assert.strictEqual((await call({ type: 'OPEN_TAB', url: 'https://example.com/' })).ok, true);
    assert.strictEqual((await call({ type: 'OPEN_TAB', url: 'view-source:https://example.com/' })).ok, true);
    assert.strictEqual((await call({ type: 'DOWNLOAD', url: 'data:text/html;base64,PHNjcmlwdD4=' })).ok, false);
    assert.strictEqual((await call({ type: 'DOWNLOAD', url: 'data:image/png;base64,iVBORw0KGgo=', filename: '../../evil.png' })).ok, true);
    assert.strictEqual(downloads.pop().filename, '_.._evil.png');
    assert.strictEqual((await call({ type: 'RELAY_FRAME', frameId: 'x', payload: {} })).ok, false);
    assert.strictEqual((await call({ type: 'NAV', dir: 'nuke' })).ok, false);
    b.g.fetch = async () => new Response('<html>', { headers: { 'content-type': 'text/html' } });
    assert.match((await call({ type: 'FETCH_DATA_URL', url: 'https://bank.example/account' })).error, /Not a media file/);
    const run = (msg) => new Promise((resolve) => {
      const out = [];
      connectCb({ name: 'fc-llm', sender: { id: 'x' }, postMessage: (m) => { out.push(m); if (m.done || m.error) resolve(out); }, onDisconnect: { addListener() {} }, onMessage: { addListener: (f) => setTimeout(() => f(msg)) } });
    });
    b.g.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { headers: { 'content-type': 'application/json' } });
    assert.match((await run({ url: 'http://api.example.com/v1/chat', key: 'sk-1', prompt: 'p' }))[0].error, /unencrypted HTTP/);
    deq(await run({ url: 'http://192.168.1.5:11434/v1/chat/completions', key: 'sk-1', prompt: 'p' }), [{ delta: 'ok' }, { done: true }]);
    deq(await run({ url: 'http://api.example.com/v1/chat', prompt: 'no key' }), [{ delta: 'ok' }, { done: true }]);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
