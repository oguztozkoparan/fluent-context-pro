// FluentContext Pro — background.
// Chromium runs this as a service worker (importScripts below); Firefox runs it as an event page
// with the same modules listed in its manifest (see scripts/build.mjs).
/* global importScripts */
if (typeof importScripts === 'function' && !(self.FC && self.FC.config)) {
  importScripts('src/build-info.js', 'src/platform.js', 'src/util.js', 'src/icons.js', 'src/items.js', 'src/config.js', 'src/updates.js');
}

(function (g) {
  'use strict';
  const FC = g.FC;
  const api = FC.api;
  const U = FC.util;
  const MAX_FETCH = 25 * 1024 * 1024;

  api.runtime.onInstalled.addListener((details) => {
    FC.config.migrate().catch((e) => console.warn('[FluentContext] migration failed', e));
    FC.updates.onInstalled(details).catch((e) => console.warn('[FluentContext] update hook failed', e));
  });
  api.runtime.onStartup && api.runtime.onStartup.addListener(() => FC.updates.schedule());
  FC.updates.listen();

  // ---------- Input validation (messages come from our content scripts, but their data comes from web pages) ----------
  const needTab = (s) => { if (!s || !s.tab) throw new Error('No tab'); return s.tab; };
  function tabUrl(raw) {
    const p = U.parseUrl(raw);
    if (!p) throw new Error('Invalid URL');
    if (/^(https?|ftp):$/.test(p.protocol)) return p.href;
    if (p.protocol === 'view-source:' && U.isHttpUrl(String(raw).slice('view-source:'.length))) return String(raw);
    throw new Error(`Blocked URL scheme ${p.protocol}`);
  }
  function downloadUrl(raw) {
    const p = U.parseUrl(raw);
    if (!p) throw new Error('Invalid URL');
    if (/^(https?|ftp):$/.test(p.protocol)) return p.href;
    // Only media payloads may arrive as data: URLs (clipboard fallback, blob conversion).
    if (p.protocol === 'data:' && /^data:(image|video|audio)\/[\w.+-]+[;,]/i.test(raw)) return raw;
    throw new Error(`Blocked URL scheme ${p.protocol}`);
  }

  async function createTab(url, active, sender) {
    const tab = sender && sender.tab;
    try {
      await api.tabs.create({ url, active, index: tab ? tab.index + 1 : undefined, openerTabId: tab ? tab.id : undefined });
    } catch (e) {
      await api.tabs.create({ url, active }); // e.g. Firefox for Android ignores index/opener
    }
    return true;
  }

  const handlers = {
    TAB_INFO: (m, s) => ({ url: (s.tab && s.tab.url) || '', title: (s.tab && s.tab.title) || '' }),

    // Frame relay: iframes talk to the top frame (and back) through here. Page scripts cannot use this channel.
    RELAY_TOP: (m, s) => api.tabs.sendMessage(needTab(s).id, { fc: 'fromFrame', frameId: s.frameId, payload: m.payload }, { frameId: 0 }),
    RELAY_FRAME: (m, s) => {
      if (!Number.isInteger(m.frameId) || m.frameId < 0) throw new Error('Bad frame');
      return api.tabs.sendMessage(needTab(s).id, { fc: 'fromTop', payload: m.payload }, { frameId: m.frameId });
    },

    OPEN_TAB: (m, s) => createTab(tabUrl(m.url), m.active !== false, s),
    OPEN_INCOGNITO: async (m) => {
      if (!api.windows) throw new Error('Not supported on this browser');
      await api.windows.create({ url: tabUrl(m.url), incognito: true });
      return true;
    },
    DOWNLOAD: (m) => {
      if (!api.downloads) throw new Error('Not supported on this browser');
      const filename = U.safeFilename(m.filename || '');
      return api.downloads.download({ url: downloadUrl(m.url), filename: filename || undefined, saveAs: !!m.saveAs, conflictAction: 'uniquify' });
    },
    SCREENSHOT: (m, s) => api.tabs.captureVisibleTab(needTab(s).windowId, { format: 'png' }),
    NAV: (m, s) => {
      const id = needTab(s).id;
      if (m.dir === 'back') return api.tabs.goBack(id);
      if (m.dir === 'forward') return api.tabs.goForward(id);
      if (m.dir === 'reload') return api.tabs.reload(id);
      throw new Error('Bad direction');
    },
    TOGGLE_PIN: async (m, s) => {
      const tab = await api.tabs.get(needTab(s).id);
      await api.tabs.update(tab.id, { pinned: !tab.pinned });
      return !tab.pinned;
    },
    TOGGLE_MUTE: async (m, s) => {
      const tab = await api.tabs.get(needTab(s).id);
      const muted = !(tab.mutedInfo && tab.mutedInfo.muted);
      await api.tabs.update(tab.id, { muted });
      return muted;
    },
    // Host permissions let the background read images that page CORS rules block. Cookies are never
    // sent and only media responses are returned, so this cannot be used to read logged-in pages.
    FETCH_DATA_URL: async (m) => {
      if (!U.isHttpUrl(m.url)) throw new Error('Unsupported URL');
      const res = await fetch(m.url, { credentials: 'omit', redirect: 'follow', cache: 'force-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = (res.headers.get('content-type') || '').toLowerCase();
      if (type && !/^(image|video|audio)\/|^(application|binary)\/octet-stream/.test(type)) throw new Error('Not a media file');
      if (Number(res.headers.get('content-length')) > MAX_FETCH) throw new Error('File too large');
      const blob = await res.blob();
      if (blob.size > MAX_FETCH) throw new Error('File too large');
      return U.blobToDataUrl(blob);
    },
    OCR_IMAGE: (m) => ocrImage(m.imageUrl, m.apiKey, m.language),

    // Settings page
    UPDATE_STATUS: () => FC.updates.status(),
    UPDATE_CHECK: () => FC.updates.check({ force: true }),
    WHATS_NEW_SEEN: () => FC.updates.seen()
  };

  api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const fn = msg && handlers[msg.type];
    if (!fn || (sender && sender.id && sender.id !== api.runtime.id)) return false;
    Promise.resolve()
      .then(() => fn(msg, sender))
      .then((result) => sendResponse({ ok: true, result }), (err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
    return true; // async response
  });

  // ---------- OCR ----------
  async function ocrImage(imageUrl, apiKey, language) {
    if (!apiKey) throw new Error('OCR.Space API key missing');
    const isData = String(imageUrl).startsWith('data:');
    if (!isData && !U.isHttpUrl(imageUrl)) throw new Error('Unsupported image URL');
    if (isData && !/^data:image\//i.test(imageUrl)) throw new Error('Not an image');
    const form = new FormData();
    form.append('apikey', apiKey);
    form.append('language', /^[a-z]{3}$/.test(language) ? language : 'eng');
    form.append('OCREngine', '2');
    form.append('scale', 'true');
    form.append(isData ? 'base64Image' : 'url', imageUrl);
    const res = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: form, credentials: 'omit' });
    if (!res.ok) throw new Error(`OCR server returned ${res.status}`);
    const data = await res.json();
    if (data.IsErroredOnProcessing) throw new Error([].concat(data.ErrorMessage || 'OCR error').join(' '));
    const text = (data.ParsedResults || []).map((r) => r.ParsedText || '').join('\n').trim();
    if (!text) throw new Error('No readable text found');
    return text;
  }

  // ---------- LLM (OpenAI-compatible, streamed over a port) ----------
  // API keys are only sent over HTTPS, or to this machine / the local network.
  function assertSafeEndpoint(url, key) {
    const p = U.parseUrl(url);
    if (!p || !/^https?:$/.test(p.protocol)) throw new Error('The endpoint must be an http(s) URL');
    if (key && p.protocol === 'http:' && !U.isPrivateHost(p.hostname)) throw new Error('Refusing to send an API key over unencrypted HTTP. Use an https:// endpoint.');
  }

  api.runtime.onConnect.addListener((port) => {
    if (port.name !== 'fc-llm' || (port.sender && port.sender.id !== api.runtime.id)) return;
    const ctrl = new AbortController();
    // Keeps a Chromium service worker alive during long, silent requests.
    const keepAlive = setInterval(() => { try { api.runtime.getPlatformInfo(); } catch (e) { /* ignore */ } }, 20000);
    const finish = () => clearInterval(keepAlive);
    port.onDisconnect.addListener(() => { ctrl.abort(); finish(); });
    port.onMessage.addListener(async (m) => {
      try {
        await streamChat(m, ctrl.signal, (delta) => port.postMessage({ delta }));
        port.postMessage({ done: true });
      } catch (e) {
        if (!ctrl.signal.aborted) { try { port.postMessage({ error: e.message || String(e) }); } catch (err) { /* port gone */ } }
      } finally {
        finish();
      }
    });
  });

  async function streamChat({ url, model, key, prompt, stream }, signal, onDelta) {
    if (!url) throw new Error('LLM endpoint URL missing');
    assertSafeEndpoint(url, key);
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;
    const body = { messages: [{ role: 'user', content: String(prompt).slice(0, 100000) }], stream: !!stream };
    if (model) body.model = model;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal, credentials: 'omit' });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch (e) { /* ignore */ }
      throw new Error(`HTTP ${res.status}${detail ? ` — ${detail}` : ''}`);
    }
    const type = res.headers.get('content-type') || '';
    if (!stream || !type.includes('text/event-stream') || !res.body) {
      const data = await res.json();
      const text = (data.choices && data.choices[0] && (data.choices[0].message ? data.choices[0].message.content : data.choices[0].text)) || (data.message && data.message.content) || '';
      if (!text) throw new Error('Empty or unexpected response');
      onDelta(text);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let got = false;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const j = JSON.parse(payload);
          const c = j.choices && j.choices[0];
          const delta = (c && ((c.delta && c.delta.content) || c.text)) || '';
          if (delta) { got = true; onDelta(delta); }
        } catch (e) { /* partial or non-JSON line */ }
      }
    }
    if (!got) throw new Error('Empty response');
  }
})(self);
