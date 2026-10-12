// FluentContext Pro — settings page (toolbar popup and full-tab options page).
(async function () {
  'use strict';
  const FC = self.FC;
  const { api, util: U, i18n, config: C, theme: T, platform: P } = FC;
  const t = i18n.t;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const OS_NAMES = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };
  const GROUPS = ['text', 'link', 'image', 'video', 'tools', 'nav'];
  const pct = (v) => `${Math.round(Number(v) * 100)}%`;
  const px = (v) => `${v}px`;
  const FORMAT = {
    bgOpacity: pct, shadowIntensity: pct, blurVal: px, borderRadius: px, fontSize: px, menuWidth: px,
    animDuration: (v) => `${v}ms`, accentColor: (v) => String(v).toUpperCase()
  };
  const send = (msg) => Promise.resolve(api.runtime.sendMessage(msg)).then((r) => r || { ok: false, error: 'No response' }, (e) => ({ ok: false, error: e.message }));
  const openUrl = (url) => { if (/^https:\/\//.test(url)) api.tabs.create({ url }); };

  const items = FC.buildItems({ icons: FC.icons, keys: P.keys });
  const byId = U.indexItems(items);
  let cfg = await C.load();
  // Lists edited through dedicated UI rather than plain inputs.
  let state = {};
  const syncState = () => {
    state = {
      disabledItems: cfg.disabledItems.slice(),
      pinnedItems: cfg.pinnedItems.slice(),
      itemOrder: cfg.itemOrder.slice(),
      customItems: cfg.customItems.map((c) => ({ ...c }))
    };
  };
  syncState();
  i18n.setLang(cfg.language);

  // ---------- Frame: fixed-size popup or full tab ----------
  const inPopup = (() => {
    if (new URLSearchParams(location.search).has('popup')) return true; // tests & screenshots
    try { if (api.extension && api.extension.getViews) return api.extension.getViews({ type: 'popup' }).includes(window); } catch (e) { /* ignore */ }
    return window.innerWidth <= 520;
  })();
  document.body.classList.add(inPopup ? 'popup' : 'wide');
  document.documentElement.dataset.variant = P.variant;
  document.documentElement.style.fontFamily = P.systemFont(P.variant);
  $('#version').textContent = `v${api.runtime.getManifest().version}`;
  $('#openTab').hidden = !inPopup;
  const h = U.h;
  const icon = (name) => FC.svgNode(FC.icons[name]);
  $('#openTab').append(icon('maximize'));
  $('#whatsNewClose').append(icon('x'));
  $$('[data-icon]').forEach((el) => el.append(icon(el.dataset.icon)));
  $('#tipMac').hidden = !P.isMac;
  $('#tipTouch').hidden = !P.isTouch();

  $('#language').append(new Option('', 'auto'), ...i18n.languages().map((l) => new Option(l.name, l.code)));
  $('#fontFamily').append(new Option('', 'system'), ...Object.entries(T.FONT_LABELS).map(([k, v]) => new Option(v, k)));

  // ---------- Fields (every [data-key] element maps to a setting) ----------
  const fields = $$('[data-key]');
  const isList = (el) => el.dataset.list !== undefined;
  const field = (key) => $(`[data-key="${key}"]`);
  function setField(el, v) {
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!v;
    else if (isList(el)) el.value = (v || []).join('\n');
    else el.value = v ?? '';
    showValue(el);
  }
  function readField(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'range' || el.type === 'number') return Number(el.value);
    if (isList(el)) return el.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    return el.value.trim();
  }
  function showValue(el) {
    const out = $(`output[data-for="${el.dataset.key}"]`);
    if (out) out.textContent = (FORMAT[el.dataset.key] || String)(readField(el));
  }
  function current() {
    const out = { ...cfg };
    for (const el of fields) out[el.dataset.key] = readField(el);
    return { ...out, ...state };
  }
  function fillAll() {
    for (const el of fields) setField(el, cfg[el.dataset.key]);
    i18n.setLang(cfg.language);
    applyI18n();
  }

  // ---------- Saving (automatic, debounced, only changed keys) ----------
  const statusEl = $('#status');
  let statusTimer = 0;
  function setStatus(msg, isError = false, sticky = false) {
    clearTimeout(statusTimer);
    statusEl.textContent = msg;
    statusEl.title = msg;
    statusEl.classList.toggle('error', isError);
    if (!sticky && !isError) statusTimer = setTimeout(() => { statusEl.textContent = ''; }, 2200);
  }
  let saveTimer = 0;
  function scheduleSave() {
    clearTimeout(saveTimer);
    setStatus(t('p_saving'), false, true);
    saveTimer = setTimeout(save, 350);
  }
  async function save() {
    saveTimer = 0;
    const next = C.sanitize(current());
    const patch = {};
    for (const [k, v] of Object.entries(next)) if (JSON.stringify(v) !== JSON.stringify(cfg[k])) patch[k] = v;
    if (!Object.keys(patch).length) { setStatus(t('p_saved')); return; }
    const prev = cfg;
    cfg = next;
    try {
      await C.save(patch);
      setStatus(t('p_saved'));
    } catch (e) {
      cfg = prev;
      setStatus(t('p_saveFailed', { msg: e.message }), true);
    }
  }
  const flush = () => { if (saveTimer) { clearTimeout(saveTimer); save(); } };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  // Changes made elsewhere (menu toggles, another window) show up live.
  C.onChange(async (changes) => {
    if (saveTimer || Object.keys(changes).every((k) => k === 'updateInfo' || k === 'whatsNew')) return;
    const fresh = await C.load();
    if (JSON.stringify(fresh) === JSON.stringify(cfg)) return;
    cfg = fresh;
    syncState();
    fillAll();
  });

  // ---------- i18n ----------
  function applyI18n() {
    document.documentElement.lang = i18n.lang;
    const vars = { os: OS_NAMES[P.variant] };
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n, vars); });
    $$('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', el.title); });
    $$('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    $$('nav.tabs button').forEach((b) => { b.title = b.textContent; });
    $('#language option[value="auto"]').textContent = t('p_langAuto');
    $('#fontFamily option[value="system"]').textContent = t('p_fontSystem');
    updateCustomPlaceholder();
    renderItemGroups();
    renderCustom();
    renderPreview();
    renderUpdates();
  }

  // ---------- Tabs ----------
  const tabs = $$('nav.tabs [role="tab"]');
  function selectTab(name) {
    tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    $$('section.tab').forEach((s) => s.classList.toggle('active', s.id === `tab-${name}`));
    $('#main').scrollTop = 0;
    try { localStorage.setItem('fc-tab', name); } catch (e) { /* ignore */ }
  }
  tabs.forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
  let savedTab = 'style';
  try { savedTab = localStorage.getItem('fc-tab') || 'style'; } catch (e) { /* ignore */ }
  selectTab(tabs.some((b) => b.dataset.tab === savedTab) ? savedTab : 'style');

  // ---------- Live preview (the real renderer, static) ----------
  // The menu stylesheet resets its host (:host { all: initial }), so attach to an inner element.
  const pvHost = $('#preview');
  const pvMount = document.createElement('div');
  pvHost.append(pvMount);
  const pvShadow = pvMount.attachShadow({ mode: 'open' });
  const pvStyle = document.createElement('style');
  pvStyle.textContent = T.CSS;
  const pvRoot = document.createElement('div');
  pvRoot.className = 'fc-root static';
  pvShadow.append(pvStyle, pvRoot);
  function renderPreview() {
    const c = current();
    T.apply(pvRoot, c);
    pvHost.dataset.theme = T.resolveDark(c) ? 'dark' : 'light';
    pvHost.dataset.variant = T.resolveVariant(c);
    pvRoot.textContent = '';
    const SEP = { type: 'separator' };
    const nav = ['back', 'forward', 'reload', 'print'].map((id) => byId.get(id));
    const list = [
      ...(c.navBar ? [{ type: 'bar', items: nav }, SEP] : []),
      byId.get('copy'), byId.get('search'), byId.get('textTools'),
      ...(c.navBar ? [] : [SEP, byId.get('back'), byId.get('reload')])
    ];
    FC.MenuView.renderStatic(pvRoot, list, { label: (it) => t(it.id), focusIndex: 1, disabled: (it) => it.id === 'forward' });
    document.documentElement.style.setProperty('--accent', c.accentColor);
    document.documentElement.style.setProperty('--on-accent', T.vars(c)['--fc-on-accent']);
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderPreview);

  // Choosing a style writes that platform's preset into the form.
  $('#platformStyle').addEventListener('change', (e) => {
    const preset = C.preset(C.resolveVariant(e.target.value));
    for (const [k, v] of Object.entries(preset)) setField(field(k), v);
    setField(field('fontFamily'), 'system');
  });

  for (const el of fields) {
    const evt = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      showValue(el);
      if (el.dataset.key === 'language') { i18n.setLang(el.value); applyI18n(); }
      if (el.dataset.key === 'menuLayout') renderItemGroups();
      renderPreview();
      scheduleSave();
    });
  }

  // ---------- Menu items: grouped by category, toggle, pin, reorder, filter ----------
  const groupsEl = $('#itemGroups');
  const settingsKids = (it) => (it.children || []).filter((c) => c.type !== 'separator' && !c.hideInSettings);

  function itemRow(it, isRoot) {
    const li = document.createElement('li');
    li.className = 'it';
    li.dataset.id = it.id;
    const off = state.disabledItems.includes(it.id);
    const pinned = state.pinnedItems.includes(it.id);
    li.classList.toggle('off', off);
    const label = t(it.id);
    const kids = settingsKids(it);
    const inMore = it.secondary && field('menuLayout').value !== 'full';
    const pinLabel = t(pinned ? 'p_unpin' : 'p_pin');
    const row = h('div', { class: 'row' },
      isRoot
        ? h('button', { type: 'button', class: 'icon-btn grip', title: t('p_move'), 'aria-label': `${t('p_move')}: ${label}` }, icon('grip'))
        : h('span', { class: 'spacer' }),
      h('span', { class: 'ic' }, it.icon ? FC.svgNode(it.icon) : null),
      h('span', { class: 'lbl', text: label, title: label }),
      inMore ? h('span', { class: 'tag', text: t('p_inMore') }) : null,
      kids.length ? h('button', { type: 'button', class: 'icon-btn expand', 'aria-expanded': 'false', title: t('p_subItems'), 'aria-label': t('p_subItems') }, icon('chevronDown')) : null,
      h('button', { type: 'button', class: 'icon-btn pin', 'aria-pressed': String(pinned), title: pinLabel, 'aria-label': `${pinLabel}: ${label}` }, icon('pin')),
      h('span', { class: 'switch' }, h('input', { type: 'checkbox', 'data-toggle': true, 'aria-label': label, checked: !off }), h('span', { class: 'track' })));
    li.append(row);
    if (kids.length) {
      const ul = document.createElement('ul');
      ul.className = 'children';
      ul.hidden = true;
      kids.forEach((k) => ul.append(itemRow(k, false)));
      li.append(ul);
    }
    return li;
  }

  function renderItemGroups() {
    const open = new Set($$('.it > .children:not([hidden])', groupsEl).map((ul) => ul.parentElement.dataset.id));
    groupsEl.textContent = '';
    const ordered = U.applyOrder(items, state.itemOrder);
    for (const g of GROUPS) {
      const members = ordered.filter((it) => it.group === g);
      if (!members.length) continue;
      const sec = document.createElement('section');
      sec.className = 'grp';
      sec.dataset.group = g;
      const h = document.createElement('h4');
      h.textContent = t(`g_${g}`);
      const ul = document.createElement('ul');
      ul.className = 'item-list';
      members.forEach((it) => ul.append(itemRow(it, true)));
      sec.append(h, ul);
      groupsEl.append(sec);
    }
    for (const id of open) {
      const li = $(`.it[data-id="${CSS.escape(id)}"]`, groupsEl);
      if (li) { $(':scope > .children', li).hidden = false; $(':scope > .row .expand', li).setAttribute('aria-expanded', 'true'); }
    }
    applyFilter();
  }
  const commitOrder = () => { state.itemOrder = $$('.item-list > .it', groupsEl).map((li) => li.dataset.id); scheduleSave(); };

  function applyFilter() {
    const q = $('#itemFilter').value.trim().toLocaleLowerCase(i18n.lang);
    for (const sec of $$('.grp', groupsEl)) {
      let any = false;
      for (const li of $$('.item-list > .it', sec)) {
        const own = $(':scope > .row .lbl', li).textContent.toLocaleLowerCase(i18n.lang).includes(q);
        const kids = $$(':scope > .children > .it', li);
        let kidMatch = false;
        for (const k of kids) {
          const m = !q || $('.lbl', k).textContent.toLocaleLowerCase(i18n.lang).includes(q);
          k.hidden = !!q && !m && !own;
          kidMatch = kidMatch || (!!q && m);
        }
        const show = !q || own || kidMatch;
        li.hidden = !show;
        if (q && kidMatch && !own) { $(':scope > .children', li).hidden = false; }
        any = any || show;
      }
      sec.hidden = !any;
    }
  }
  $('#itemFilter').addEventListener('input', applyFilter);

  groupsEl.addEventListener('change', (e) => {
    const box = e.target.closest('[data-toggle]');
    if (!box) return;
    const li = box.closest('.it');
    const id = li.dataset.id;
    state.disabledItems = box.checked ? state.disabledItems.filter((x) => x !== id) : [...new Set([...state.disabledItems, id])];
    li.classList.toggle('off', !box.checked);
    scheduleSave();
  });
  groupsEl.addEventListener('click', (e) => {
    const pin = e.target.closest('.pin');
    const exp = e.target.closest('.expand');
    if (pin) {
      const id = pin.closest('.it').dataset.id;
      const on = !state.pinnedItems.includes(id);
      state.pinnedItems = on ? [...state.pinnedItems, id] : state.pinnedItems.filter((x) => x !== id);
      pin.setAttribute('aria-pressed', String(on));
      pin.title = t(on ? 'p_unpin' : 'p_pin');
      scheduleSave();
    } else if (exp) {
      const ul = $(':scope > .children', exp.closest('.it'));
      ul.hidden = !ul.hidden;
      exp.setAttribute('aria-expanded', String(!ul.hidden));
    }
  });
  // Keyboard reordering on the grip handle (within the category).
  groupsEl.addEventListener('keydown', (e) => {
    const grip = e.target.closest('.grip');
    if (!grip || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const li = grip.closest('.it');
    const list = li.parentElement;
    const sib = e.key === 'ArrowUp' ? li.previousElementSibling : li.nextElementSibling;
    if (!sib) return;
    if (e.key === 'ArrowUp') list.insertBefore(li, sib); else list.insertBefore(sib, li);
    grip.focus();
    commitOrder();
  });
  // Drag and drop from the grip only, constrained to the item's own category.
  let dragEl = null;
  groupsEl.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.grip');
    if (grip) grip.closest('.it').draggable = true;
  });
  groupsEl.addEventListener('dragstart', (e) => {
    dragEl = e.target.closest('.it[draggable="true"]');
    if (!dragEl) return;
    dragEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragEl.dataset.id); // Firefox requires data to start a drag
  });
  groupsEl.addEventListener('dragover', (e) => {
    if (!dragEl) return;
    const list = dragEl.parentElement;
    const r = list.getBoundingClientRect();
    if (e.clientY < r.top - 20 || e.clientY > r.bottom + 20) return;
    e.preventDefault();
    const after = $$(':scope > .it:not(.dragging)', list).find((li) => {
      const b = li.getBoundingClientRect();
      return e.clientY < b.top + b.height / 2;
    });
    if (after) list.insertBefore(dragEl, after); else list.append(dragEl);
  });
  groupsEl.addEventListener('drop', (e) => e.preventDefault());
  groupsEl.addEventListener('dragend', () => {
    if (!dragEl) return;
    dragEl.classList.remove('dragging');
    dragEl.draggable = false;
    dragEl = null;
    commitOrder();
  });
  $('#resetOrder').addEventListener('click', () => { state.itemOrder = []; renderItemGroups(); scheduleSave(); });

  // ---------- Custom actions ----------
  const customErr = $('#customError');
  function validateCustom(type, template) {
    if (!template) return t('p_needsTemplate');
    if (type === 'url' && !U.validTemplate(template)) return t('p_invalidUrl');
    return '';
  }
  function updateCustomPlaceholder() {
    $('#customTemplate').placeholder = t($('#customType').value === 'ai' ? 'p_customTemplateAi' : 'p_customTemplateUrl');
  }
  $('#customType').addEventListener('change', updateCustomPlaceholder);

  function renderCustom() {
    const wrap = $('#customList');
    wrap.textContent = '';
    if (!state.customItems.length) {
      const p = document.createElement('div');
      p.className = 'empty';
      p.textContent = t('p_noCustom');
      wrap.append(p);
      return;
    }
    state.customItems.forEach((c, i) => {
      const sel = h('select', { class: 'c-type', 'aria-label': t('p_customTitle') }, new Option(t('p_customTypeUrl'), 'url'), new Option(t('p_customTypeAi'), 'ai'));
      const lbl = h('input', { class: 'c-label', type: 'text', maxlength: 60 });
      const del = h('button', { type: 'button', class: 'icon-btn c-btn' }, icon('trash'));
      const tpl = h('input', { class: 'c-tpl', type: 'text', spellcheck: 'false' });
      const row = h('div', { class: 'custom-row' }, sel, lbl, del, tpl);
      sel.value = c.type;
      lbl.value = c.label;
      lbl.placeholder = t('p_customLabel');
      tpl.value = c.template;
      tpl.placeholder = t(c.type === 'ai' ? 'p_customTemplateAi' : 'p_customTemplateUrl');
      del.title = t('p_remove');
      del.setAttribute('aria-label', `${t('p_remove')}: ${c.label}`);
      const update = () => {
        state.customItems[i] = { type: sel.value, label: lbl.value.trim(), template: tpl.value.trim() };
        const err = validateCustom(sel.value, tpl.value.trim());
        tpl.setAttribute('aria-invalid', String(!!err));
        tpl.title = err;
        if (!err) scheduleSave();
      };
      sel.addEventListener('change', update);
      lbl.addEventListener('input', update);
      tpl.addEventListener('input', update);
      del.addEventListener('click', () => { state.customItems.splice(i, 1); renderCustom(); scheduleSave(); });
      wrap.append(row);
    });
  }
  $('#customAdd').addEventListener('click', () => {
    const type = $('#customType').value;
    const label = $('#customLabel').value.trim();
    const template = $('#customTemplate').value.trim();
    const err = validateCustom(type, template);
    customErr.hidden = !err;
    customErr.textContent = err;
    if (err) { $('#customTemplate').focus(); return; }
    state.customItems.push({ type, label: label || template.slice(0, 40), template });
    $('#customLabel').value = '';
    $('#customTemplate').value = '';
    renderCustom();
    scheduleSave();
  });

  // ---------- Updates ----------
  let upd = null;
  function renderUpdates() {
    $('#updVersion').textContent = t('p_version', { v: api.runtime.getManifest().version });
    const statusLine = $('#updStatus');
    const actions = $('#updActions');
    const check = $('#updCheck');
    const auto = field('autoUpdateCheck');
    actions.hidden = true;
    $('#updateBanner').hidden = true;
    if (!upd) { statusLine.textContent = ''; return; }
    check.disabled = upd.channel !== 'github';
    auto.disabled = upd.channel !== 'github';
    if (upd.channel === 'store') { statusLine.textContent = t('p_storeManaged'); return; }
    if (upd.channel === 'none') { statusLine.textContent = t('p_noRepo'); return; }
    const info = upd.info;
    if (info && info.status === 'available') {
      statusLine.textContent = t('p_updateAvailable', { v: info.latest });
      actions.hidden = false;
      $('#updateBannerText').textContent = t('p_updateAvailable', { v: info.latest });
      $('#updateBanner').hidden = false;
    } else if (info && info.status === 'unpublished') {
      statusLine.textContent = t('p_noRepo');
    } else if (info) {
      const when = new Date(info.checkedAt).toLocaleString(i18n.lang, { dateStyle: 'medium', timeStyle: 'short' });
      statusLine.textContent = `${t('p_upToDate')} ${t('p_lastChecked', { time: when })}`;
    } else statusLine.textContent = '';
    if (upd.whatsNew) {
      $('#whatsNewText').textContent = t('p_whatsNew', { v: upd.whatsNew.version });
      $('#whatsNewBtn').hidden = !upd.releasesUrl;
    }
  }
  async function loadUpdates() {
    const r = await send({ type: 'UPDATE_STATUS' });
    if (!r.ok) return;
    upd = r.result;
    if (upd.whatsNew) {
      $('#whatsNewBanner').hidden = false;
      send({ type: 'WHATS_NEW_SEEN' }); // clears the toolbar badge; the banner stays for this visit
    }
    renderUpdates();
  }
  $('#updCheck').addEventListener('click', async () => {
    const btn = $('#updCheck');
    btn.disabled = true;
    $('#updStatus').textContent = t('p_checking');
    const r = await send({ type: 'UPDATE_CHECK' });
    btn.disabled = false;
    if (!r.ok) { $('#updStatus').textContent = t('p_updateError', { msg: r.error }); return; }
    upd = { ...upd, info: r.result };
    renderUpdates();
  });
  const downloadUpdate = () => { if (upd && upd.info && upd.info.url) openUrl(upd.info.url); };
  $('#updDownload').addEventListener('click', downloadUpdate);
  $('#updateBannerBtn').addEventListener('click', downloadUpdate);
  $('#whatsNewBtn').addEventListener('click', () => {
    if (upd && upd.releasesUrl) openUrl(upd.whatsNew ? `${upd.releasesUrl}/tag/v${upd.whatsNew.version}` : upd.releasesUrl);
  });
  $('#whatsNewClose').addEventListener('click', () => { $('#whatsNewBanner').hidden = true; });

  // ---------- Backup ----------
  $('#exportBtn').addEventListener('click', async () => {
    flush();
    const data = JSON.stringify(C.exportable(C.sanitize(current())), null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const filename = `fluentcontext-settings-${new Date().toISOString().slice(0, 10)}.json`;
    if (api.downloads && api.downloads.download) {
      try { await api.downloads.download({ url, filename, saveAs: true }); } catch (e) { if (!/cancel/i.test(e.message || '')) setStatus(e.message, true); }
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
  $('#importBtn').addEventListener('click', () => {
    // Firefox closes popups when a file picker opens; continue in a tab there.
    if (inPopup && P.isFirefox) { api.runtime.openOptionsPage(); window.close(); return; }
    $('#importFile').click();
  });
  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('file is larger than 1 MB');
      const json = JSON.parse(await file.text());
      const incoming = json && typeof json === 'object' && json.settings ? json.settings : json;
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error('not a settings file');
      for (const k of C.SECRET_KEYS) delete incoming[k];
      const next = C.sanitize({ ...cfg, ...incoming });
      const patch = { ...next };
      for (const k of C.SECRET_KEYS) delete patch[k];
      await C.save(patch);
      cfg = next;
      syncState();
      fillAll();
      setStatus(t('p_importDone'));
    } catch (err) {
      setStatus(t('p_importFailed', { msg: err.message }), true);
    }
  });

  // ---------- Reset (inline confirmation: confirm() is unavailable in Firefox popups) ----------
  const resetBtn = $('#resetBtn');
  let armed = 0;
  resetBtn.addEventListener('click', async () => {
    if (!armed) {
      resetBtn.classList.add('danger');
      setStatus(t('p_resetConfirm'), false, true);
      armed = setTimeout(() => { armed = 0; resetBtn.classList.remove('danger'); setStatus(''); }, 4000);
      return;
    }
    clearTimeout(armed);
    armed = 0;
    resetBtn.classList.remove('danger');
    clearTimeout(saveTimer);
    saveTimer = 0;
    await C.reset();
    cfg = await C.load();
    syncState();
    fillAll();
    setStatus(t('p_resetDone'));
  });

  // ---------- Permissions (Firefox grants host access separately) ----------
  if (api.permissions && api.permissions.contains) {
    const origins = { origins: ['<all_urls>'] };
    Promise.resolve(api.permissions.contains(origins)).then((has) => { $('#permBanner').hidden = !!has; }, () => {});
    $('#permGrant').addEventListener('click', () => {
      Promise.resolve(api.permissions.request(origins)).then((ok) => { if (ok) $('#permBanner').hidden = true; }, () => {});
    });
  }

  $('#openTab').addEventListener('click', () => { api.runtime.openOptionsPage(); window.close(); });

  fillAll();
  loadUpdates();
})();
