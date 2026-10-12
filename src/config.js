// FluentContext Pro — settings: defaults, per-platform presets, validation and storage.
// Normal settings live in storage.sync (follow the browser account); secrets stay in storage.local.
(function (g) {
  'use strict';
  const FC = (g.FC = g.FC || {});
  if (FC.config) return;
  const api = FC.api;
  const P = FC.platform;
  const U = FC.util;

  const SCHEMA = 3;
  const SECRET_KEYS = ['ocrKey', 'llmKey'];
  const ENUMS = {
    platformStyle: ['auto', 'windows', 'macos', 'linux'],
    theme: ['auto', 'dark', 'light'],
    density: ['compact', 'normal', 'comfortable'],
    animStyle: ['scale', 'slide', 'fade', 'none'],
    searchEngine: ['google', 'bing', 'duckduckgo', 'yandex', 'ecosia', 'brave'],
    fontFamily: ['system', 'segoe', 'sf', 'inter', 'roboto', 'mono'],
    menuLayout: ['compact', 'full']
  };
  const RANGES = {
    bgOpacity: [0.2, 1], blurVal: [0, 60], borderRadius: [0, 24], fontSize: [10, 20],
    menuWidth: [140, 400], shadowIntensity: [0, 1], animDuration: [0, 600]
  };

  // Look presets: choosing a style in settings writes these values into the form.
  const PRESETS = {
    windows: { accentColor: '#0078d4', borderRadius: 8, blurVal: 24, bgOpacity: 0.82, shadowIntensity: 0.45, density: 'normal', fontSize: 13, animStyle: 'scale', animDuration: 150 },
    macos: { accentColor: '#007aff', borderRadius: 10, blurVal: 30, bgOpacity: 0.74, shadowIntensity: 0.35, density: 'compact', fontSize: 13, animStyle: 'fade', animDuration: 120 },
    linux: { accentColor: '#3584e4', borderRadius: 12, blurVal: 0, bgOpacity: 0.98, shadowIntensity: 0.3, density: 'comfortable', fontSize: 14, animStyle: 'fade', animDuration: 120 }
  };

  const BASE = {
    schemaVersion: SCHEMA,
    language: 'auto',
    platformStyle: 'auto',
    theme: 'auto',
    fontFamily: 'system',
    menuWidth: 220,
    showIcons: true,
    showShortcuts: true,
    menuLayout: 'compact',
    navBar: true,
    autoUpdateCheck: true,
    searchEngine: 'google',
    translateLang: '',
    disabledItems: [],
    pinnedItems: [],
    itemOrder: [],
    customItems: [],
    blockedSites: [],
    darkSites: [],
    llmUrl: 'http://localhost:1234/v1/chat/completions',
    llmModel: '',
    llmKey: '',
    llmStream: true,
    ocrKey: '',
    ocrLang: ''
  };

  let defaultOffCache = null;
  function defaultOff() {
    if (!defaultOffCache) {
      defaultOffCache = [];
      if (FC.buildItems) U.walkItems(FC.buildItems({ icons: FC.icons, keys: P.keys }), (it) => { if (it.defaultOff) defaultOffCache.push(it.id); });
    }
    return defaultOffCache.slice();
  }

  const resolveVariant = (style) => (style && style !== 'auto' ? style : P.variant);
  const preset = (variant) => ({ ...(PRESETS[variant] || PRESETS.windows) });
  const defaults = () => ({ ...BASE, ...preset(P.variant), disabledItems: defaultOff() });

  function sanitizeCustom(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map((c) => {
        if (!c || typeof c !== 'object') return null;
        const type = c.type === 'ai' ? 'ai' : 'url';
        const template = String(c.template ?? c.url ?? '').trim().slice(0, 2000);
        const label = String(c.label || '').trim().slice(0, 60) || template.slice(0, 40);
        if (!template) return null;
        if (type === 'url' && !U.validTemplate(template)) return null;
        return { type, label, template };
      })
      .filter(Boolean)
      .slice(0, 50);
  }
  const stringList = (v) => [...new Set((Array.isArray(v) ? v : []).filter((s) => typeof s === 'string').map((s) => s.trim()).filter(Boolean))];

  // Accepts anything (old versions, imports) and returns a complete, valid settings object.
  function sanitize(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const d = defaults();
    const out = {};
    for (const [k, dv] of Object.entries(d)) {
      let v = raw[k];
      if (v === undefined || v === null) { out[k] = Array.isArray(dv) ? dv.slice() : dv; continue; }
      if (typeof dv === 'number' && typeof v === 'string') v = parseFloat(v);
      if (Array.isArray(dv)) out[k] = Array.isArray(v) ? v : dv.slice();
      else if (typeof v === typeof dv && !(typeof v === 'number' && !Number.isFinite(v))) out[k] = v;
      else out[k] = dv;
    }
    for (const [k, allowed] of Object.entries(ENUMS)) if (!allowed.includes(out[k])) out[k] = d[k];
    for (const [k, [lo, hi]] of Object.entries(RANGES)) out[k] = U.clamp(out[k], lo, hi);
    if (!/^#[0-9a-f]{6}$/i.test(out.accentColor)) out.accentColor = d.accentColor;
    if (out.language !== 'auto' && !/^[a-z]{2,3}$/.test(out.language)) out.language = 'auto';
    out.translateLang = String(out.translateLang).trim().slice(0, 12);
    out.ocrLang = String(out.ocrLang).trim().slice(0, 8);
    for (const k of ['disabledItems', 'pinnedItems', 'itemOrder']) out[k] = stringList(out[k]);
    out.blockedSites = stringList(out.blockedSites).map(U.normalizeHost).filter(Boolean);
    out.darkSites = stringList(out.darkSites).map(U.normalizeHost).filter(Boolean);
    out.customItems = sanitizeCustom(out.customItems);
    out.schemaVersion = SCHEMA;
    return out;
  }

  // Some browsers (or policies) lack storage.sync; fall back to local transparently.
  const syncArea = () => (api.storage.sync && api.storage.sync !== api.storage.local ? api.storage.sync : api.storage.local);
  const get = (area, keys) => area.get(keys).catch(() => ({}));

  async function load() {
    const [local, sync] = await Promise.all([get(api.storage.local, null), get(syncArea(), null)]);
    const merged = {};
    // Legacy settings that have not been migrated yet still count, but sync wins.
    for (const [k, v] of Object.entries(local)) if (!SECRET_KEYS.includes(k)) merged[k] = v;
    Object.assign(merged, sync);
    for (const k of SECRET_KEYS) if (local[k] !== undefined) merged[k] = local[k];
    return sanitize(merged);
  }

  async function save(patch) {
    const secret = {};
    const rest = {};
    for (const [k, v] of Object.entries(patch)) (SECRET_KEYS.includes(k) ? secret : rest)[k] = v;
    const jobs = [];
    if (Object.keys(rest).length) jobs.push(syncArea().set(rest));
    if (Object.keys(secret).length) jobs.push(api.storage.local.set(secret));
    await Promise.all(jobs);
  }

  // Restores defaults but keeps API keys, which are tedious to re-enter.
  const reset = async () => {
    const keys = Object.keys(defaults()).filter((k) => !SECRET_KEYS.includes(k));
    const sync = syncArea();
    if (sync !== api.storage.local) await sync.clear();
    await api.storage.local.remove(keys);
    await sync.set({ schemaVersion: SCHEMA });
  };

  function onChange(cb) {
    api.storage.onChanged.addListener((changes, area) => { if (area === 'sync' || area === 'local') cb(changes, area); });
  }

  // Export without secrets so files can be shared safely.
  const exportable = (cfg) => {
    const out = { ...cfg };
    SECRET_KEYS.forEach((k) => delete out[k]);
    return { app: 'FluentContext Pro', exportedAt: new Date().toISOString(), settings: out };
  };

  // Runs from the background on install/update: moves v5 settings from local to sync and
  // turns off niche items for existing users once.
  async function migrate() {
    const local = await get(api.storage.local, null);
    const sync = syncArea();
    const synced = await get(sync, null);
    const version = synced.schemaVersion || local.schemaVersion || 0;
    const known = Object.keys(defaults());
    if (sync !== api.storage.local) {
      const move = {};
      for (const k of known) if (!SECRET_KEYS.includes(k) && local[k] !== undefined && synced[k] === undefined) move[k] = local[k];
      if (Object.keys(move).length) {
        await sync.set(move);
        await api.storage.local.remove(Object.keys(move));
        Object.assign(synced, move);
      }
    }
    if (version < SCHEMA) {
      const patch = { schemaVersion: SCHEMA };
      if (Array.isArray(synced.disabledItems)) {
        patch.disabledItems = [...new Set([...synced.disabledItems.filter((id) => id !== 'savePdf'), ...defaultOff()])];
      }
      if (synced.customItems) patch.customItems = sanitizeCustom(synced.customItems);
      await sync.set(patch);
    }
  }

  FC.config = { SECRET_KEYS, ENUMS, PRESETS, defaults, preset, resolveVariant, sanitize, load, save, reset, onChange, exportable, migrate, defaultOff };
})(self);
