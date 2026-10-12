// FluentContext Pro — tiny runtime i18n. Language can be switched at runtime (unlike chrome.i18n).
// String packs register themselves with FC.i18n.add({ en: {...}, tr: {...} }); missing keys fall back to English.
(function (g) {
  'use strict';
  const FC = (g.FC = g.FC || {});
  if (FC.i18n) return;
  const dicts = {};

  const i18n = {
    lang: 'en',
    add(pack) {
      for (const [code, dict] of Object.entries(pack)) dicts[code] = Object.assign(dicts[code] || {}, dict);
    },
    languages() {
      return Object.keys(dicts).map((code) => ({ code, name: dicts[code]._name || code }));
    },
    resolve(setting) {
      if (setting && setting !== 'auto' && dicts[setting]) return setting;
      const nav = g.navigator || {};
      const list = nav.languages && nav.languages.length ? nav.languages : [nav.language || 'en'];
      for (const l of list) {
        const base = String(l).toLowerCase().split('-')[0];
        if (dicts[base]) return base;
      }
      return 'en';
    },
    setLang(setting) {
      i18n.lang = i18n.resolve(setting);
      return i18n.lang;
    },
    name(code) {
      return (dicts[code || i18n.lang] || {})._name || 'English';
    },
    t(key, vars) {
      let s = (dicts[i18n.lang] && dicts[i18n.lang][key]) ?? (dicts.en && dicts.en[key]) ?? key;
      if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
      return s;
    },
    has(key) {
      return !!dicts.en && key in dicts.en;
    },
    _dicts: dicts
  };
  FC.i18n = i18n;
})(self);
