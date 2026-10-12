// FluentContext Pro — content script controller.
//
// Frame model: every frame runs this script. A right-click opens the menu in the clicked frame.
// If that frame is too small for the menu (ads, embeds), the menu is shown by the top frame instead:
// the iframe sends the context through the background (trusted channel) and its on-screen position
// through a postMessage chain (each ancestor adds its iframe offset). Actions that need live DOM
// elements (`scope: 'frame'`) are sent back to the iframe; everything else runs where the menu is.
(function (g) {
  'use strict';
  const FC = g.FC;
  if (!FC || FC.contentStarted) return;
  FC.contentStarted = true;

  const api = FC.api;
  const U = FC.util;
  const i18n = FC.i18n;
  const t = i18n.t;
  const isTop = g === g.top;
  const SEP = { type: 'separator' };
  const ENGINES = {
    google: 'https://www.google.com/search?q=%s',
    bing: 'https://www.bing.com/search?q=%s',
    duckduckgo: 'https://duckduckgo.com/?q=%s',
    yandex: 'https://yandex.com/search/?text=%s',
    ecosia: 'https://www.ecosia.org/search?q=%s',
    brave: 'https://search.brave.com/search?q=%s'
  };
  const OCR_LANG = { en: 'eng', tr: 'tur', de: 'ger', fr: 'fre', es: 'spa', ru: 'rus' };

  let cfg = FC.config.defaults();
  let tabInfo = { url: '', title: '' };
  const items = FC.buildItems({ icons: FC.icons, keys: FC.platform.keys });
  const byId = U.indexItems(items);
  const host = new FC.Host(() => cfg);
  i18n.setLang(cfg.language);

  // ---------- Extension plumbing ----------
  // After an extension update the old script is orphaned; it must stop intercepting clicks.
  const alive = () => { try { return !!(api && api.runtime && api.runtime.id); } catch (e) { return false; } };
  function send(msg) {
    if (!alive()) return Promise.resolve({ ok: false, error: 'Extension updated. Reload the page.' });
    try {
      return Promise.resolve(api.runtime.sendMessage(msg)).then((r) => r || { ok: false, error: 'No response' }, (e) => ({ ok: false, error: e.message }));
    } catch (e) {
      return Promise.resolve({ ok: false, error: e.message });
    }
  }
  const relayTop = (payload) => send({ type: 'RELAY_TOP', payload });
  const relayFrame = (frameId, payload) => send({ type: 'RELAY_FRAME', frameId, payload });

  async function reloadConfig() {
    try { cfg = await FC.config.load(); } catch (e) { return; }
    i18n.setLang(cfg.language);
    host.refreshTheme();
    if (isTop && FC.dark) FC.dark.apply(U.hostMatches(cfg.darkSites, location.hostname));
  }
  reloadConfig();
  FC.config.onChange(reloadConfig);
  if (!isTop) send({ type: 'TAB_INFO' }).then((r) => { if (r.ok && r.result) tabInfo = r.result; });

  const ancestorUrl = () => { const ao = location.ancestorOrigins; return ao && ao.length ? ao[ao.length - 1] : ''; };
  const pageUrl = () => (isTop ? location.href : tabInfo.url || ancestorUrl() || location.href);
  const pageTitle = () => (isTop ? document.title : tabInfo.title || '');
  const blocked = () => U.hostMatches(cfg.blockedSites, location.hostname) || U.hostMatches(cfg.blockedSites, U.hostOf(pageUrl()));

  // ---------- Context ----------
  function findMedia(el, x, y) {
    let image = el.closest('img') || (el.localName === 'picture' ? el.querySelector('img') : null);
    let video = el.closest('video');
    // Sites often lay transparent overlays over media (players, galleries). Look underneath,
    // but only when the clicked element carries no text of its own.
    const overlay = ![...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (overlay && !image && !video && typeof document.elementsFromPoint === 'function') {
      for (const n of document.elementsFromPoint(x, y).slice(0, 8)) {
        if (n.localName === 'video') { video = n; break; }
        if (n.localName === 'img') { image = n; break; }
      }
    }
    return { image, video };
  }

  function snapshot(target, x, y) {
    const el = target && target.nodeType === 1 ? target : (target && target.parentElement) || document.documentElement;
    const a = el.closest('a[href], area[href]');
    const { image, video } = findMedia(el, x, y);
    const sel = g.getSelection ? g.getSelection() : null;
    const selection = sel ? sel.toString().trim() : '';
    const nav = g.navigation;
    const url = pageUrl();
    const ctx = {
      selection,
      lang: U.langOf(selection && sel.anchorNode ? sel.anchorNode : el),
      link: a && U.isNavigable(a.href) ? a.href : null,
      linkText: a ? (a.innerText || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 500) : '',
      image: image ? image.currentSrc || image.src || null : null,
      imageInfo: image ? { w: Math.round(image.clientWidth), h: Math.round(image.clientHeight), nw: image.naturalWidth, nh: image.naturalHeight } : null,
      video: video ? { src: video.currentSrc || video.src || '', rate: video.playbackRate, loop: video.loop } : null,
      isTop,
      remote: false,
      frameUrl: location.href,
      pageUrl: url,
      pageHost: U.hostOf(url),
      pageTitle: pageTitle(),
      darkSite: U.hostMatches(cfg.darkSites, U.hostOf(url)),
      caps: {
        eyeDropper: typeof g.EyeDropper === 'function',
        pip: !!document.pictureInPictureEnabled,
        speech: 'speechSynthesis' in g,
        speaking: 'speechSynthesis' in g && g.speechSynthesis.speaking,
        nav: !!(nav && 'canGoBack' in nav),
        canGoBack: !!(nav && nav.canGoBack),
        canGoForward: !!(nav && nav.canGoForward)
      }
    };
    return { ctx, el: { target: el, image, video } };
  }

  // ---------- Item visibility ----------
  const isOn = (it) => !cfg.disabledItems.includes(it.id);
  const isPinned = (it) => cfg.pinnedItems.includes(it.id);
  function childrenOf(it, ctx, env) {
    let extra = [];
    try { extra = it.extra ? it.extra(ctx, env) : []; } catch (e) { extra = []; }
    const list = [...(it.children || []), ...extra];
    return U.cleanSeparators(list.filter((ch) => ch.type === 'separator' || (isOn(ch) && !isPinned(ch) && visible(ch, ctx, env))));
  }
  function visible(it, ctx, env) {
    try { if (it.when && !it.when(ctx, env)) return false; } catch (e) { return false; }
    if (it.children || it.extra) return childrenOf(it, ctx, env).length > 0;
    return true;
  }
  // Compact layout: each category keeps its main actions; the rest move into one "More …" submenu.
  // A single leftover action stays inline — a submenu with one entry is worse than one extra row.
  function collapseSecondary(list) {
    const order = [];
    const byGroup = new Map();
    for (const it of list) {
      if (!byGroup.has(it.group)) { byGroup.set(it.group, { main: [], more: [] }); order.push(it.group); }
      byGroup.get(it.group)[it.secondary ? 'more' : 'main'].push(it);
    }
    const out = [];
    for (const group of order) {
      const { main, more } = byGroup.get(group);
      out.push(...main);
      if (more.length === 1) out.push(more[0]);
      else if (more.length > 1) out.push({ id: `more-${group}`, group, icon: FC.icons.more, label: () => `more_${group}`, children: more });
    }
    return out;
  }

  // Order: navigation icon bar, pinned items, then categories (separators between categories).
  function rootItems(ctx, env) {
    const shown = (it) => it && isOn(it) && visible(it, ctx, env);
    const pinned = cfg.pinnedItems.map((id) => byId.get(id)).filter(shown);
    let rest = U.applyOrder(items, cfg.itemOrder).filter((it) => !isPinned(it) && shown(it));
    const out = [];
    if (cfg.navBar) {
      const nav = rest.filter((it) => it.group === 'nav');
      if (nav.length) out.push({ type: 'bar', items: nav });
      rest = rest.filter((it) => it.group !== 'nav');
    }
    if (cfg.menuLayout !== 'full') rest = collapseSecondary(rest);
    if (pinned.length) { if (out.length) out.push(SEP); out.push(...pinned); }
    let group = out.length ? '\u0000top' : null;
    for (const it of rest) {
      if (group !== null && it.group !== group) out.push(SEP);
      out.push(it);
      group = it.group;
    }
    return out;
  }
  const labelFor = (ctx) => (it) => (it.raw ? it.text : t(typeof it.label === 'function' ? it.label(ctx) : it.id));

  // ---------- Actions environment ----------
  // The textarea lives in our closed shadow root, so page scripts (MutationObserver) cannot read it.
  function execCopy(text) {
    host.ensure();
    const sel = g.getSelection();
    const saved = sel ? Array.from({ length: sel.rangeCount }, (_, i) => sel.getRangeAt(i)) : [];
    const active = document.activeElement;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed!important;top:0!important;left:0!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;';
    host.root.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    if (sel) { sel.removeAllRanges(); saved.forEach((r) => sel.addRange(r)); }
    try { if (active && active.focus) active.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    return ok;
  }

  // The async Clipboard API is missing on http:// pages; execCommand works there thanks to clipboardWrite.
  async function copyText(text, msg) {
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); ok = true; }
    } catch (e) { /* fall back */ }
    if (!ok) ok = execCopy(text);
    host.toast(ok ? msg || t('copied') : t('clipboardFailed'), ok ? 'success' : 'error');
    return ok;
  }

  const canWriteImages = () => typeof g.ClipboardItem === 'function' && !!(navigator.clipboard && navigator.clipboard.write);

  async function copyPng(blob, key) {
    try {
      if (!canWriteImages()) throw new Error('unsupported');
      const png = await U.blobToPng(blob);
      await navigator.clipboard.write([new g.ClipboardItem({ 'image/png': png })]);
      host.toast(t(key || 'imageCopied'), 'success');
      return true;
    } catch (e) {
      const r = await send({ type: 'DOWNLOAD', url: await U.blobToDataUrl(blob), filename: `fluentcontext-${Date.now()}.png` });
      host.toast(r.ok ? t('savedAsFile') : t('clipboardFailed'), r.ok ? 'info' : 'error', 4000);
      return false;
    }
  }

  // Page-context fetch first (keeps cookies, works for blob:/data:), then the background, which is not bound by CORS.
  async function fetchBlob(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.blob();
    } catch (e) {
      if (/^(blob|data):/i.test(url)) throw e;
      const r = await send({ type: 'FETCH_DATA_URL', url });
      if (!r.ok) throw new Error(r.error);
      return U.dataUrlToBlob(r.result);
    }
  }

  async function copyImage(url) {
    try {
      if (!canWriteImages()) throw new Error('unsupported');
      const png = await U.blobToPng(await fetchBlob(url));
      await navigator.clipboard.write([new g.ClipboardItem({ 'image/png': png })]);
      host.toast(t('imageCopied'), 'success');
    } catch (e) {
      await copyText(url, t('imageCopyFailed'));
    }
  }

  async function openTab(url, background) {
    const r = await send({ type: 'OPEN_TAB', url, active: !background });
    if (!r.ok && !background) g.open(url, '_blank', 'noopener');
  }

  async function download(url, filename, saveAs) {
    try { if (/^blob:/i.test(url)) url = await U.blobToDataUrl(await fetchBlob(url)); } catch (e) { /* let the browser try */ }
    const r = await send({ type: 'DOWNLOAD', url, filename: filename || '', saveAs: !!saveAs });
    if (r.ok) { if (!saveAs) host.toast(t('downloadStarted'), 'success'); } else if (!/cancel/i.test(r.error || '')) host.toast(t('downloadFailed', { msg: r.error }), 'error', 5000);
  }

  function launch(url) {
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.documentElement.append(a);
    a.click();
    a.remove();
  }

  function speak(text, lang) {
    const synth = g.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new g.SpeechSynthesisUtterance(text);
    const l = lang || document.documentElement.lang || navigator.language || '';
    if (l) {
      u.lang = l;
      const base = l.toLowerCase().split('-')[0];
      const voice = synth.getVoices().find((v) => v.lang.toLowerCase() === l.toLowerCase()) || synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(base));
      if (voice) u.voice = voice;
    }
    synth.speak(u);
    host.toast(t('speaking'), 'info');
  }

  async function toggleDarkSite(h) {
    const norm = U.normalizeHost(h);
    const on = !U.hostMatches(cfg.darkSites, norm);
    const next = on ? [...cfg.darkSites, norm] : cfg.darkSites.filter((entry) => !U.hostMatches([entry], norm));
    await FC.config.save({ darkSites: next });
    host.toast(on ? t('darkOn', { host: norm }) : t('darkOff'), 'info');
  }

  async function disableSite(h) {
    const norm = U.normalizeHost(h);
    await FC.config.save({ blockedSites: [...new Set([...cfg.blockedSites, norm])] });
    host.toast(t('siteDisabled', { host: norm }), 'info', 5000);
  }

  function runLlm(prompt, title, env) {
    let port = null;
    const panel = host.panel({
      title, streaming: true,
      onStop: () => { try { if (port) port.disconnect(); } catch (e) { /* ignore */ } },
      onCopy: (s) => env.copy(s)
    });
    try { port = api.runtime.connect({ name: 'fc-llm' }); } catch (e) { panel.fail(t('llmError', { msg: e.message })); return; }
    port.onMessage.addListener((m) => {
      if (m.delta) panel.append(m.delta);
      else if (m.done) { panel.done(); port.disconnect(); }
      else if (m.error) { panel.fail(t('llmError', { msg: m.error })); port.disconnect(); }
    });
    port.onDisconnect.addListener(() => {
      if (!panel.finished) panel.fail(t('llmError', { msg: (api.runtime.lastError && api.runtime.lastError.message) || 'connection closed' }));
    });
    port.postMessage({ url: cfg.llmUrl, model: cfg.llmModel, key: cfg.llmKey, prompt, stream: cfg.llmStream });
  }

  async function runOcr(url, env) {
    if (!cfg.ocrKey) { host.toast(t('ocrNoKey'), 'error', 5000); return; }
    const busy = host.toast(t('ocrReading'), 'loading', 0);
    let imageUrl = url;
    if (!U.isHttpUrl(url)) { try { imageUrl = await U.blobToDataUrl(await fetchBlob(url)); } catch (e) { /* send as-is */ } }
    const r = await send({ type: 'OCR_IMAGE', imageUrl, apiKey: cfg.ocrKey, language: cfg.ocrLang || OCR_LANG[i18n.lang] || 'eng' });
    busy.dismiss();
    if (r.ok) env.panel(t('ocrResult'), r.result);
    else host.toast(t('ocrError', { msg: r.error }), 'error', 5000);
  }

  function makeEnv() {
    const env = {
      t,
      uiLang: () => i18n.lang,
      langName: () => i18n.name(),
      targetLang: () => cfg.translateLang || i18n.lang,
      searchUrl: (q) => U.fillTemplate(ENGINES[cfg.searchEngine] || ENGINES.google, q),
      customItems: (type) => cfg.customItems.filter((c) => c.type === type),
      send,
      toast: (m, k, d) => host.toast(m, k, d),
      panel: (title, text) => host.panel({ title, text, onCopy: (s) => env.copy(s) }),
      qr: (text) => {
        let svg;
        try { svg = FC.qr.toSvg(text); } catch (e) { host.toast(t('qrTooLong'), 'error'); return; }
        host.panel({ title: t('qrTitle'), qrSvg: svg, caption: text, copyText: text, onCopy: (s) => env.copy(s) });
      },
      copy: copyText,
      copyPng,
      copyImage,
      fetchBlob,
      open: (url, o) => openTab(url, !!(o && o.background)),
      launch,
      download,
      llm: (prompt, title) => runLlm(prompt, title, env),
      ocr: (url) => runOcr(url, env),
      speak,
      stopSpeaking: () => g.speechSynthesis && g.speechSynthesis.cancel(),
      toggleDarkSite,
      disableSite,
      menuClosed: () => new Promise((r) => setTimeout(r, Number((host.root && host.root.dataset.animMs) || 0) + 80))
    };
    return env;
  }

  // Used by an iframe running a `frame` action for a menu the top page showed:
  // user-visible effects (clipboard, toasts, panels) happen in the top page, which has focus.
  function relayedEnv() {
    const env = makeEnv();
    const call = (method, args) => relayTop({ kind: 'env', method, args });
    env.copy = (text, msg) => call('copy', [text, msg]);
    env.toast = (m, k, d) => { call('toast', [m, k, d]); return { dismiss() {}, update() {} }; };
    env.panel = (title, text) => call('panel', [title, text]);
    env.copyPng = async (blob, key) => call('copyPng', [await U.blobToDataUrl(blob), key]);
    return env;
  }

  async function execute(item, ctx, env) {
    try { await item.run(ctx, env); } catch (e) {
      console.warn('[FluentContext]', e);
      env.toast(String((e && e.message) || e), 'error');
    }
  }

  function activate(item, ctx, live, remote, env) {
    host.view.close();
    if (item.scope === 'frame' && remote) { relayFrame(remote.frameId, { kind: 'run', token: remote.token, id: item.id }); return; }
    if (item.scope === 'top' && !isTop) { relayTop({ kind: 'run', id: item.id, ctx }); return; }
    execute(item, live ? { ...ctx, el: live } : ctx, env);
  }

  function showMenu(list, env, { ctx, live, x, y, remote, byKeyboard }) {
    host.ensure();
    host.raise();
    host.refreshTheme();
    host.view.open(list, {
      x, y,
      focusFirst: !!byKeyboard,
      label: labelFor(ctx),
      checked: (it) => { try { return !!it.checked(ctx); } catch (e) { return false; } },
      disabled: (it) => { try { return !!(it.disabled && it.disabled(ctx)); } catch (e) { return false; } },
      children: (it) => childrenOf(it, ctx, env),
      onActivate: (it) => activate(it, ctx, live, remote, env),
      onClose: () => { if (remote) relayFrame(remote.frameId, { kind: 'closed', token: remote.token }); }
    });
  }

  // ---------- Iframe → top relay ----------
  let remoteToken = null;
  const pending = new Map(); // token → snapshot with live elements (iframe side)

  function closeRemote() {
    if (!remoteToken) return;
    remoteToken = null;
    relayTop({ kind: 'hide' });
  }

  function fitsFrame() {
    const m = host.view && host.view.rootEl();
    if (!m) return true;
    const vw = document.documentElement.clientWidth || g.innerWidth;
    const vh = document.documentElement.clientHeight || g.innerHeight;
    return m.offsetWidth <= vw - 16 && m.scrollHeight <= vh - 16;
  }

  async function openRemote(snap, list, env, x, y, byKeyboard) {
    const token = U.randomId();
    pending.set(token, snap);
    try { g.parent.postMessage({ __fc: 'geo', token, x, y }, '*'); } catch (e) { /* detached */ }
    const r = await relayTop({ kind: 'open', token, ctx: { ...snap.ctx, remote: true }, byKeyboard });
    if (r.ok && r.result === true) { remoteToken = token; return; }
    pending.delete(token);
    // The top page cannot host it (restricted page, blocked site, no script there): show it here anyway.
    showMenu(list, env, { ctx: snap.ctx, live: snap.el, x, y, byKeyboard });
  }

  // Geometry chain: each frame converts child-iframe coordinates into its own and passes them up.
  const geo = new Map();
  const geoWaiters = new Map();
  function geoResolve(token, pos) {
    geo.set(token, pos);
    setTimeout(() => geo.delete(token), 5000);
    const w = geoWaiters.get(token);
    if (w) { geoWaiters.delete(token); w(pos); }
  }
  function geoWait(token, ms) {
    if (geo.has(token)) return Promise.resolve(geo.get(token));
    return new Promise((resolve) => {
      geoWaiters.set(token, resolve);
      setTimeout(() => { if (geoWaiters.get(token) === resolve) { geoWaiters.delete(token); resolve(null); } }, ms);
    });
  }
  g.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.__fc !== 'geo' || typeof d.token !== 'string' || !e.source || !Number.isFinite(d.x) || !Number.isFinite(d.y)) return;
    const frame = Array.from(document.querySelectorAll('iframe, frame')).find((f) => { try { return f.contentWindow === e.source; } catch (err) { return false; } });
    if (!frame) return;
    const r = frame.getBoundingClientRect();
    const cs = getComputedStyle(frame);
    const sx = frame.offsetWidth ? r.width / frame.offsetWidth : 1;
    const sy = frame.offsetHeight ? r.height / frame.offsetHeight : 1;
    const x = r.left + (frame.clientLeft + (parseFloat(cs.paddingLeft) || 0) + d.x) * sx;
    const y = r.top + (frame.clientTop + (parseFloat(cs.paddingTop) || 0) + d.y) * sy;
    if (isTop) geoResolve(d.token, { x, y });
    else { try { g.parent.postMessage({ __fc: 'geo', token: d.token, x, y }, '*'); } catch (err) { /* ignore */ } }
  });

  const RELAYABLE = ['copy', 'copyPng', 'toast', 'panel'];
  async function fromFrame(frameId, p) {
    switch (p.kind) {
      case 'open': {
        if (blocked()) return false;
        const pos = (await geoWait(p.token, 160)) || { x: 24, y: 24 };
        const ctx = p.ctx;
        const env = makeEnv();
        const list = rootItems(ctx, env);
        if (!list.length) return false;
        showMenu(list, env, { ctx, live: null, x: pos.x, y: pos.y, remote: { frameId, token: p.token }, byKeyboard: p.byKeyboard });
        return true;
      }
      case 'key':
        if (host.view && host.view.isOpen()) host.view.handleKey(p.key);
        return true;
      case 'hide':
        if (host.view) host.view.close();
        return true;
      case 'env': {
        if (!RELAYABLE.includes(p.method)) return false;
        const env = makeEnv();
        const args = Array.isArray(p.args) ? p.args : [];
        if (p.method === 'copyPng') await env.copyPng(U.dataUrlToBlob(String(args[0])), args[1]);
        else await env[p.method](...args);
        return true;
      }
      case 'run': {
        const it = byId.get(p.id);
        if (it && it.scope === 'top') await execute(it, p.ctx, makeEnv());
        return true;
      }
      default:
        return false;
    }
  }

  async function fromTop(p) {
    if (p.kind === 'closed') {
      if (remoteToken === p.token) remoteToken = null;
      setTimeout(() => pending.delete(p.token), 3000);
      return true;
    }
    if (p.kind === 'run') {
      const snap = pending.get(p.token);
      const it = byId.get(p.id);
      if (!snap || !it || it.scope !== 'frame') return false;
      await execute(it, { ...snap.ctx, remote: true, el: snap.el }, relayedEnv());
      return true;
    }
    return false;
  }

  if (api && api.runtime && api.runtime.onMessage) {
    api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || !msg.fc || (sender && sender.id && sender.id !== api.runtime.id)) return false;
      let job;
      if (msg.fc === 'fromFrame' && isTop) job = fromFrame(msg.frameId, msg.payload || {});
      else if (msg.fc === 'fromTop' && !isTop) job = fromTop(msg.payload || {});
      else return false;
      Promise.resolve(job).then((v) => sendResponse(v === undefined ? true : v), () => sendResponse(false));
      return true;
    });
  }

  // ---------- Events ----------
  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    if (el.localName === 'textarea' || el.localName === 'select') return true;
    if (el.localName === 'input') return !/^(button|checkbox|radio|range|color|file|submit|reset|image|hidden)$/i.test(el.type);
    return false;
  }

  // Keyboard-invoked menus (Menu key, Shift+F10) may report 0,0: anchor to the selection or focus instead.
  function pointFor(e) {
    if (e.clientX || e.clientY) return { x: e.clientX, y: e.clientY };
    const sel = g.getSelection();
    let r = null;
    if (sel && sel.rangeCount && !sel.isCollapsed) r = sel.getRangeAt(0).getBoundingClientRect();
    if (!r || (!r.width && !r.height)) {
      const a = document.activeElement;
      if (a && a !== document.body && a.getBoundingClientRect) r = a.getBoundingClientRect();
    }
    return r && (r.width || r.height) ? { x: Math.round(r.left + Math.min(r.width, 24)), y: Math.round(r.bottom) } : { x: 16, y: 16 };
  }

  let lastTarget = null;

  g.addEventListener('contextmenu', (e) => {
    if (!e.isTrusted || !alive()) return;
    if (host.el && e.composedPath().includes(host.el)) { e.preventDefault(); return; }
    closeRemote();
    if (host.view) host.view.close(false);
    if (e.shiftKey || e.defaultPrevented || blocked()) return;
    const target = e.composedPath()[0] || e.target;
    if (isEditable(target)) return;

    const byKeyboard = e.pointerId === -1 || e.pointerType === '';
    const { x, y } = pointFor(e);
    const snap = snapshot(target, x, y);
    const env = makeEnv();
    const list = rootItems(snap.ctx, env);
    if (!list.length) return; // nothing to offer: keep the native menu
    e.preventDefault();
    lastTarget = snap.el.target;

    showMenu(list, env, { ctx: snap.ctx, live: snap.el, x, y, byKeyboard });
    if (isTop || fitsFrame()) return;
    host.view.close(false);
    openRemote(snap, list, env, x, y, byKeyboard);
  }, false);

  g.addEventListener('keydown', (e) => {
    if (!e.isTrusted) return;
    if (remoteToken) {
      if (e.key.length === 1 || /^(Arrow|Enter|Escape|Home|End|Page|Tab)/.test(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        relayTop({ kind: 'key', key: e.key });
        if (e.key === 'Escape' || e.key === 'Tab') remoteToken = null;
      }
      return;
    }
    if (host.view && host.view.isOpen()) {
      if ((e.ctrlKey || e.metaKey || e.altKey || e.isComposing) && e.key !== 'Escape') return;
      if (host.view.handleKey(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); }
      return;
    }
    if (e.key === 'Escape' && host.panelEl) { host.closePanel(); e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  g.addEventListener('pointerdown', (e) => {
    if (remoteToken) closeRemote();
    if (host.view && host.view.isOpen() && !(host.el && e.composedPath().includes(host.el))) host.view.close();
  }, true);

  // Only scrolling that moves the clicked content closes the menu (auto-scrolling carousels do not).
  g.addEventListener('scroll', (e) => {
    const tg = e.target;
    const moves = tg === document || tg === document.documentElement || tg === document.scrollingElement || (lastTarget && tg.contains && tg.contains(lastTarget));
    if (!moves) return;
    closeRemote();
    if (host.view) host.view.close();
  }, { capture: true, passive: true });

  const closeAll = () => { closeRemote(); if (host.view) host.view.close(false); };
  g.addEventListener('resize', closeAll);
  g.addEventListener('pagehide', closeAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) closeAll(); });
  document.addEventListener('fullscreenchange', () => { closeAll(); host.raise(); });
  g.addEventListener('blur', () => { if (!remoteToken && host.view && host.view.isOpen()) host.view.close(); });
})(self);
