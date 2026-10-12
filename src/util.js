// FluentContext Pro — shared helpers. Pure helpers work everywhere; DOM helpers are only
// called from pages and content scripts.
(function (g) {
  'use strict';
  const FC = (g.FC = g.FC || {});
  if (FC.util) return;
  const U = {};

  // ---------- Basics ----------
  U.enc = encodeURIComponent;
  U.clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  U.num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  U.escapeHtml = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  U.randomId = () => {
    const a = new Uint32Array(3);
    crypto.getRandomValues(a);
    return Array.from(a, (n) => n.toString(36)).join('');
  };
  U.safeLocale = (lang) => {
    if (!lang) return undefined;
    try { return Intl.getCanonicalLocales(lang)[0]; } catch (e) { return undefined; }
  };

  // ---------- URLs & hosts ----------
  U.parseUrl = (u, base) => { try { return new URL(u, base); } catch (e) { return null; } };
  U.isHttpUrl = (u) => { const p = U.parseUrl(u); return !!p && (p.protocol === 'http:' || p.protocol === 'https:'); };
  U.isNavigable = (u) => { const p = U.parseUrl(u); return !!p && /^(https?|ftp|file):$/.test(p.protocol); };
  U.hostOf = (u) => { const p = U.parseUrl(u); return p ? p.hostname.toLowerCase() : ''; };
  U.normalizeHost = (s) =>
    String(s || '').trim().toLowerCase()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
      .replace(/[/?#].*$/, '')
      .replace(/:\d+$/, '')
      .replace(/^\*\./, '')
      .replace(/^www\./, '');
  // This machine or the local network (where plain http is normal for self-hosted tools).
  U.isPrivateHost = (host) => {
    const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h === '::1') return true;
    const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(h);
    if (!m) return false;
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
  };
  // Semantic version comparison for "1.2.3" style strings: -1, 0 or 1.
  U.compareVersions = (a, b) => {
    const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return Math.sign(d);
    }
    return 0;
  };
  // "figma.com" matches figma.com and every subdomain of it.
  U.hostMatches = (list, host) => {
    host = String(host || '').toLowerCase();
    if (!host || !Array.isArray(list)) return false;
    return list.some((entry) => {
      const e = U.normalizeHost(entry);
      return !!e && (host === e || host.endsWith('.' + e));
    });
  };

  const TRACKING = /^(utm_[a-z0-9_]+|fbclid|gclid|gclsrc|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|igsh|yclid|ysclid|twclid|ttclid|li_fat_id|epik|_hsenc|_hsmi|__hssc|__hstc|__hsfp|hsctatracking|mkt_tok|vero_id|vero_conv|oly_anon_id|oly_enc_id|_openstat|wickedid|rb_clickid|s_cid|srsltid|ref_src|ref_url|trk|trkcampaign)$/i;
  const HOST_PARAMS = [
    [/(^|\.)(youtube\.com|youtu\.be)$/, /^(si|feature|pp)$/i],
    [/(^|\.)spotify\.com$/, /^(si|context)$/i],
    [/(^|\.)amazon\.[a-z.]+$/, /^(ref|ref_|pf_rd_[a-z]+|pd_rd_[a-z]+|content-id|smid|linkcode|tag|linkid|camp|creative|creativeasin)$/i],
    [/(^|\.)(aliexpress|alibaba)\.[a-z.]+$/, /^(spm|scm|algo_[a-z]+|aff_[a-z_]+|sk|terminal_id|pvid)$/i]
  ];
  const REDIRECTS = [
    [/(^|\.)google\.[a-z.]+$/, /^\/url$/, ['q', 'url']],
    [/^(l|lm)\.facebook\.com$/, /^\/l\.php$/, ['u']],
    [/^l\.instagram\.com$/, /^\/$/, ['u']],
    [/(^|\.)youtube\.com$/, /^\/redirect$/, ['q']],
    [/^out\.reddit\.com$/, /./, ['url']],
    [/(^|\.)linkedin\.com$/, /^\/redir\/redirect/, ['url']],
    [/^steamcommunity\.com$/, /^\/linkfilter\//, ['url', 'u']]
  ];
  // Removes tracking parameters and unwraps well-known redirect links.
  U.cleanUrl = (url, depth = 0) => {
    const p = U.parseUrl(url);
    if (!p || !/^https?:$/.test(p.protocol)) return url;
    const host = p.hostname.toLowerCase();
    if (depth < 3) {
      for (const [h, path, params] of REDIRECTS) {
        if (!h.test(host) || !path.test(p.pathname)) continue;
        for (const k of params) {
          const target = p.searchParams.get(k);
          if (target && U.isHttpUrl(target)) return U.cleanUrl(target, depth + 1);
        }
      }
    }
    const extra = HOST_PARAMS.filter(([h]) => h.test(host)).map(([, re]) => re);
    let changed = false;
    for (const key of [...new Set(p.searchParams.keys())]) {
      if (TRACKING.test(key) || extra.some((re) => re.test(key))) { p.searchParams.delete(key); changed = true; }
    }
    return changed || depth > 0 ? p.toString() : url;
  };

  // %s → URL-encoded value, %raw → value as-is. Single pass so values never get re-expanded.
  U.fillTemplate = (tpl, value) => String(tpl).replace(/%raw|%s/g, (m) => (m === '%raw' ? value : U.enc(value)));
  U.validTemplate = (tpl) => U.isHttpUrl(U.fillTemplate(tpl, 'test'));
  U.fillPrompt = (tpl, text) => (String(tpl).includes('%s') ? String(tpl).split('%s').join(text) : `${tpl}\n\n${text}`);

  // ---------- Text ----------
  U.titleCase = (s, lang) => {
    const loc = U.safeLocale(lang);
    return s.toLocaleLowerCase(loc).replace(/(^|[\s\-–—(["'“‘])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase(loc));
  };
  U.wordCount = (s, lang) => {
    try {
      if (typeof Intl.Segmenter === 'function') {
        let n = 0;
        for (const seg of new Intl.Segmenter(U.safeLocale(lang), { granularity: 'word' }).segment(s)) if (seg.isWordLike) n++;
        return n;
      }
    } catch (e) { /* fall through */ }
    return s.split(/\s+/).filter(Boolean).length;
  };
  U.charCount = (s) => [...s].length;
  U.mdEscape = (s) => String(s).replace(/([[\]\\])/g, '\\$1');
  U.formatBytes = (n, unknown = '?') => {
    if (!Number.isFinite(n)) return unknown;
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
  };
  U.safeFilename = (name) =>
    String(name || '').replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 150);
  U.filenameFromUrl = (url, fallback = '') => {
    const p = U.parseUrl(url);
    if (!p || p.protocol === 'data:' || p.protocol === 'blob:') return fallback;
    let last = p.pathname.split('/').pop() || '';
    try { last = decodeURIComponent(last); } catch (e) { /* keep raw */ }
    return /\.[a-z0-9]{2,5}$/i.test(last) ? U.safeFilename(last) : fallback;
  };

  // ---------- Binary ----------
  U.bytesToBase64 = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  U.blobToDataUrl = async (blob) =>
    `data:${blob.type || 'application/octet-stream'};base64,${U.bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`;
  U.dataUrlToBlob = (dataUrl) => {
    const comma = dataUrl.indexOf(',');
    const head = dataUrl.slice(0, comma);
    const body = dataUrl.slice(comma + 1);
    const mime = (/^data:([^;,]+)/.exec(head) || [])[1] || 'application/octet-stream';
    if (!/;base64/i.test(head)) return new Blob([decodeURIComponent(body)], { type: mime });
    const bin = atob(body);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  };
  // Clipboards only accept PNG reliably; re-encode anything else through a canvas.
  U.blobToPng = (blob) =>
    new Promise((resolve, reject) => {
      if (blob.type === 'image/png') { resolve(blob); return; }
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || 512;
        c.height = img.naturalHeight || 512;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
      img.src = url;
    });

  // Reads tEXt / iTXt / zTXt chunks (Stable Diffusion, ComfyUI prompts live here).
  U.pngTextChunks = async (bytes) => {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (sig.some((b, i) => bytes[i] !== b)) return null;
    const latin1 = new TextDecoder('latin1');
    const utf8 = new TextDecoder('utf-8');
    const out = [];
    let off = 8;
    while (off + 12 <= bytes.length) {
      const len = ((bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]) >>> 0;
      const type = String.fromCharCode(...bytes.subarray(off + 4, off + 8));
      const data = bytes.subarray(off + 8, off + 8 + len);
      if (type === 'IEND') break;
      const nul = data.indexOf(0);
      if (nul > 0 && (type === 'tEXt' || type === 'iTXt' || type === 'zTXt')) {
        const key = latin1.decode(data.subarray(0, nul));
        try {
          if (type === 'tEXt') out.push({ key, text: latin1.decode(data.subarray(nul + 1)) });
          else if (type === 'zTXt') out.push({ key, text: latin1.decode(await U.inflate(data.subarray(nul + 2))) });
          else {
            const compressed = data[nul + 1] === 1;
            let p = nul + 3;
            p = data.indexOf(0, p) + 1; // language tag
            p = data.indexOf(0, p) + 1; // translated keyword
            const raw = data.subarray(p);
            out.push({ key, text: utf8.decode(compressed ? await U.inflate(raw) : raw) });
          }
        } catch (e) { /* skip unreadable chunk */ }
      }
      off += 12 + len;
    }
    return out;
  };
  U.inflate = async (bytes) => {
    if (typeof DecompressionStream !== 'function') throw new Error('no DecompressionStream');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };

  // ---------- DOM ----------
  // h('button', { class: 'btn', type: 'button', text: 'Hi', title }, child, ...) — no HTML parsing.
  U.h = (tag, props, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'hidden' || k === 'disabled' || k === 'checked' || k === 'draggable') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c);
    return el;
  };
  U.clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };
  U.langOf = (node) => {
    const el = node && node.nodeType === 1 ? node : node && node.parentElement;
    const lang = (el && el.closest && el.closest('[lang]') && el.closest('[lang]').getAttribute('lang')) ||
      (typeof document !== 'undefined' && document.documentElement.lang) || '';
    return U.safeLocale(lang) || '';
  };
  U.collectClasses = (el) => {
    const set = new Set();
    for (let n = el; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
      (n.getAttribute('class') || '').split(/\s+/).forEach((c) => c && set.add(c));
    }
    return [...set];
  };
  U.cssSelector = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
      if (n.id) { parts.unshift(`#${CSS.escape(n.id)}`); break; }
      let part = n.localName;
      const sibs = n.parentElement ? [...n.parentElement.children].filter((s) => s.localName === n.localName) : [];
      if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(n) + 1})`;
      parts.unshift(part);
    }
    return parts.join(' > ');
  };
  U.styleSummary = (el) => {
    const cs = getComputedStyle(el);
    return ['font-family', 'font-size', 'font-weight', 'line-height', 'color', 'background-color',
      'border-color', 'border-radius', 'padding', 'margin', 'width', 'height']
      .map((p) => `${p}: ${cs.getPropertyValue(p)}`).join('\n');
  };

  // DOM → Markdown for the current selection (headings, emphasis, links, lists, code, quotes, tables).
  U.toMarkdown = (root) => {
    const abs = (href) => (U.parseUrl(href, document.baseURI) || {}).href || href;
    const wrap = (s, mark) => (s.trim() ? `${mark}${s.trim()}${mark}` : s);
    function md(n, depth) {
      if (n.nodeType === 3) return n.nodeValue.replace(/\s+/g, ' ');
      if (n.nodeType !== 1 && n.nodeType !== 11) return '';
      const tag = n.nodeType === 11 ? '#frag' : n.localName;
      const kids = (d = depth) => Array.from(n.childNodes, (c) => md(c, d)).join('');
      switch (tag) {
        case 'script': case 'style': case 'noscript': case 'template': return '';
        case 'br': return '\n';
        case 'hr': return '\n\n---\n\n';
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
          return `\n\n${'#'.repeat(+tag[1])} ${kids().trim()}\n\n`;
        case 'p': case 'div': case 'section': case 'article': case 'header': case 'footer': case 'main': case 'figure': case 'aside':
          return `\n\n${kids().trim()}\n\n`;
        case 'strong': case 'b': return wrap(kids(), '**');
        case 'em': case 'i': return wrap(kids(), '*');
        case 'del': case 's': return wrap(kids(), '~~');
        case 'code': return n.closest('pre') ? n.textContent : `\`${n.textContent}\``;
        case 'pre': return `\n\n\`\`\`\n${n.textContent.replace(/\n$/, '')}\n\`\`\`\n\n`;
        case 'a': {
          const href = n.getAttribute('href');
          const text = kids().trim();
          if (!href || /^javascript:/i.test(href)) return text;
          return `[${text || abs(href)}](${abs(href)})`;
        }
        case 'img': {
          const src = n.getAttribute('src');
          return src ? `![${(n.getAttribute('alt') || '').trim()}](${abs(src)})` : '';
        }
        case 'ul': case 'ol': {
          const start = +n.getAttribute('start') || 1;
          const lis = Array.from(n.children).filter((c) => c.localName === 'li');
          const pad = '  '.repeat(depth);
          return '\n\n' + lis.map((li, i) => {
            const body = Array.from(li.childNodes, (c) => md(c, depth + 1)).join('').trim().replace(/\n{2,}/g, '\n');
            return `${pad}${tag === 'ol' ? `${start + i}.` : '-'} ${body}`;
          }).join('\n') + '\n\n';
        }
        case 'li': return `- ${kids().trim()}\n`;
        case 'blockquote': return '\n\n' + kids().trim().split('\n').map((l) => `> ${l}`).join('\n') + '\n\n';
        case 'table': {
          const rows = Array.from(n.querySelectorAll('tr')).map((tr) =>
            Array.from(tr.children, (c) => md(c, depth).trim().replace(/\|/g, '\\|').replace(/\n+/g, ' ')));
          if (!rows.length) return kids();
          const cols = Math.max(...rows.map((r) => r.length));
          const line = (r) => `| ${Array.from({ length: cols }, (_, i) => r[i] || '').join(' | ')} |`;
          return `\n\n${line(rows[0])}\n| ${Array(cols).fill('---').join(' | ')} |\n${rows.slice(1).map(line).join('\n')}\n\n`;
        }
        default: return kids();
      }
    }
    return md(root, 0).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  };
  U.selectionMarkdown = () => {
    const sel = getSelection();
    if (!sel || !sel.rangeCount) return '';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < sel.rangeCount; i++) frag.appendChild(sel.getRangeAt(i).cloneContents());
    return U.toMarkdown(frag);
  };

  // ---------- Menu item trees ----------
  U.walkItems = (items, fn, parent = null) => {
    for (const it of items || []) {
      if (it.type === 'separator') continue;
      fn(it, parent);
      if (it.children) U.walkItems(it.children, fn, it);
    }
  };
  U.indexItems = (items) => {
    const map = new Map();
    U.walkItems(items, (it) => map.set(it.id, it));
    return map;
  };
  // Applies the user's saved order; items added in later versions stay next to their default neighbour.
  U.applyOrder = (items, order) => {
    if (!Array.isArray(order) || !order.length) return items.slice();
    const byId = new Map(items.map((it) => [it.id, it]));
    const result = order.filter((id) => byId.has(id)).map((id) => byId.get(id));
    const placed = new Set(result);
    items.forEach((it, i) => {
      if (placed.has(it)) return;
      let at = 0;
      for (let j = i - 1; j >= 0; j--) {
        const k = result.indexOf(items[j]);
        if (k !== -1) { at = k + 1; break; }
      }
      result.splice(at, 0, it);
      placed.add(it);
    });
    return result;
  };
  U.cleanSeparators = (list) => {
    const out = [];
    for (const it of list) {
      if (it.type === 'separator' && (!out.length || out[out.length - 1].type === 'separator')) continue;
      out.push(it);
    }
    while (out.length && out[out.length - 1].type === 'separator') out.pop();
    return out;
  };

  FC.util = U;
})(self);
