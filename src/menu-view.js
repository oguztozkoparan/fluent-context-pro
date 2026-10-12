// FluentContext Pro — menu renderer and interaction engine (DOM only, no browser-extension APIs).
// Used by the content script for real menus and by the settings page for the live preview.
(function (g) {
  'use strict';
  const FC = (g.FC = g.FC || {});
  if (FC.MenuView) return;

  const CLOSE_DELAY = 300; // ms before a submenu closes when the pointer leaves it
  const OPEN_DELAY = 110; // ms before hovering a row opens its submenu
  const SWITCH_DELAY = 240; // longer when another submenu is already open (diagonal pointer paths)
  const EDGE = 8; // minimum distance from viewport edges

  const hasSub = (it) => !!(it.children || it.extra);
  const viewport = () => ({
    w: document.documentElement.clientWidth || g.innerWidth || 1024,
    h: document.documentElement.clientHeight || g.innerHeight || 768
  });

  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  // Builds one row. `o` supplies label/checked/disabled callbacks so the view stays data-agnostic.
  function buildRow(it, o) {
    const row = el('div', 'item');
    const checked = typeof it.checked === 'function' ? !!(o.checked ? o.checked(it) : false) : false;
    const disabled = !!(o.disabled && o.disabled(it));
    row.setAttribute('role', it.checked ? 'menuitemcheckbox' : 'menuitem');
    if (it.checked) row.setAttribute('aria-checked', String(checked));
    if (disabled) row.setAttribute('aria-disabled', 'true');
    if (hasSub(it)) row.setAttribute('aria-haspopup', 'menu');
    if (checked) row.classList.add('checked');

    const left = el('span', 'item-left');
    const icon = el('span', 'icon');
    if (it.icon) icon.append(FC.svgNode(it.icon));
    const label = el('span', 'label');
    label.textContent = o.label(it);
    left.append(icon, label);

    const right = el('span', 'item-right');
    if (hasSub(it)) {
      const c = el('span', 'chevron');
      c.append(FC.svgNode(FC.icons.chevronRight));
      right.append(c);
    } else if (checked) {
      const c = el('span', 'check');
      c.append(FC.svgNode(FC.icons.check));
      right.append(c);
    } else if (it.shortcut) {
      const s = el('span', 'shortcut');
      s.textContent = it.shortcut;
      right.append(s);
    }
    row.append(left, right);
    row._item = it;
    return row;
  }

  // A horizontal row of icon buttons (Windows 11-style command bar) used for navigation items.
  function buildBar(bar, o) {
    const wrap = el('div', 'bar');
    wrap.setAttribute('role', 'group');
    for (const it of bar.items) {
      const b = el('button', 'bar-btn');
      b.type = 'button';
      b.tabIndex = -1;
      b.setAttribute('role', 'menuitem');
      if (it.icon) b.append(FC.svgNode(it.icon));
      const label = o.label(it);
      b.title = it.shortcut ? `${label}  ${it.shortcut}` : label;
      b.setAttribute('aria-label', label);
      if (o.disabled && o.disabled(it)) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
      b._item = it;
      wrap.append(b);
    }
    return wrap;
  }

  function buildMenu(items, o) {
    const menu = el('div', 'menu');
    menu.setAttribute('role', 'menu');
    for (const it of items) {
      if (it.type === 'separator') {
        const s = el('div', 'sep');
        s.setAttribute('role', 'separator');
        menu.append(s);
      } else if (it.type === 'bar') {
        menu.append(buildBar(it, o));
      } else {
        menu.append(buildRow(it, o));
      }
    }
    return menu;
  }
  const isBar = (row) => !!row && row.classList.contains('bar');
  const barButtons = (bar) => [...bar.querySelectorAll('.bar-btn')].filter((b) => !b.disabled);

  class MenuView {
    constructor(root) {
      this.root = root;
      this.levels = []; // [{ el, openRow }]
      this.opts = null;
      this.closeTimer = 0;
      this.closeDepth = -1;
      this.openTimer = 0;
      this.typed = '';
      this.typedAt = 0;
      this.openedAt = 0;
      this.pressed = false;
    }

    // opts: { x, y, label(it), checked(it), disabled(it), children(it), onActivate(it), onClose(), focusFirst }
    open(items, opts) {
      this.close(false);
      this.opts = opts;
      this.openedAt = performance.now();
      this.pressed = false;
      const menu = this._build(items, 0);
      this.root.append(menu);
      this._place(menu, opts.x, opts.y, null);
      this.levels.push({ el: menu, openRow: null });
      if (opts.focusFirst) this._focusEdge(0, 1);
      return menu;
    }

    isOpen() { return this.levels.length > 0; }
    rootEl() { return this.levels[0] ? this.levels[0].el : null; }

    close(animate = true) {
      clearTimeout(this.closeTimer);
      clearTimeout(this.openTimer);
      this.closeDepth = -1;
      if (!this.levels.length) return;
      const els = this.levels.map((l) => l.el);
      const onClose = this.opts && this.opts.onClose;
      this.levels = [];
      this.opts = null;
      const ms = animate ? Number(this.root.dataset.animMs || 0) : 0;
      for (const m of els) {
        if (ms > 0) {
          m.classList.add('closing');
          setTimeout(() => m.remove(), ms);
        } else m.remove();
      }
      if (onClose) onClose();
    }

    // Returns true when the key was consumed.
    handleKey(key) {
      const d = this.levels.length - 1;
      if (d < 0) return false;
      const focused = this._focused(d);
      if (isBar(focused) && (key === 'ArrowLeft' || key === 'ArrowRight')) {
        this._barMove(focused, key === 'ArrowRight' ? 1 : -1);
        return true;
      }
      switch (key) {
        case 'ArrowDown': this._move(d, 1); return true;
        case 'ArrowUp': this._move(d, -1); return true;
        case 'Home': case 'PageUp': this._focusEdge(d, 1); return true;
        case 'End': case 'PageDown': this._focusEdge(d, -1); return true;
        case 'ArrowRight':
          if (focused && !isBar(focused) && hasSub(focused._item)) this._openSubAndFocus(focused, d);
          return true;
        case 'ArrowLeft':
          if (d > 0) this._closeFrom(d);
          return true;
        case 'Escape':
          if (d > 0) this._closeFrom(d); else this.close();
          return true;
        case 'Enter': case ' ':
          if (focused) this._activate(focused, d);
          return true;
        case 'Tab':
          this.close();
          return true;
        default:
          if (key && key.length === 1) { this._typeahead(d, key); return true; }
          return false;
      }
    }

    // ---------- internals ----------
    _build(items, depth) {
      const o = this.opts;
      const menu = buildMenu(items, o);
      menu.dataset.depth = String(depth);
      menu.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.pressed = true; });
      menu.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
      menu.addEventListener('mouseenter', () => this._cancelClose(depth));
      menu.addEventListener('mouseleave', () => { if (depth > 0) this._scheduleClose(depth); });
      for (const row of menu.querySelectorAll('.item')) {
        row.addEventListener('mouseenter', () => this._hover(row, depth));
        row.addEventListener('mouseleave', () => {
          clearTimeout(this.openTimer);
          const lvl = this.levels[depth];
          if (!lvl || lvl.openRow !== row) row.classList.remove('focused');
        });
        row.addEventListener('pointerup', (e) => {
          if (!this._acceptRelease(e)) return;
          this._activate(row, depth);
        });
      }
      for (const bar of menu.querySelectorAll('.bar')) {
        for (const b of bar.querySelectorAll('.bar-btn')) {
          b.addEventListener('mouseenter', () => {
            this._setFocus(depth, bar, false);
            this._barFocus(bar, b);
            this._cancelClose(depth);
            clearTimeout(this.openTimer);
            if (this.levels.length > depth + 1) this._scheduleClose(depth + 1);
          });
          b.addEventListener('mouseleave', () => b.classList.remove('focused'));
          b.addEventListener('pointerup', (e) => {
            if (b.disabled || !this._acceptRelease(e)) return;
            if (this.opts && this.opts.onActivate) this.opts.onActivate(b._item);
          });
        }
      }
      return menu;
    }

    // Touch & left click need a press that started on the menu (so the finger that opened a
    // long-press menu cannot trigger an item). Press-drag-release with the right button is
    // how macOS and Linux users pick items, so allow it after a short grace period.
    // Synthetic events from page scripts are ignored.
    _acceptRelease(e) {
      if (!e.isTrusted) return false;
      const elapsed = performance.now() - this.openedAt;
      const ok = this.pressed ? e.button === 0 || e.button === 2 : e.button === 2 && elapsed > 300;
      if (!ok) return false;
      e.preventDefault();
      e.stopPropagation();
      this.pressed = false;
      return true;
    }

    _place(menu, x, y, anchor) {
      const { w: vw, h: vh } = viewport();
      const w = menu.offsetWidth; // layout size — unaffected by the opening transform
      const h = menu.offsetHeight;
      let left, top, ox = 'left', oy = 'top';
      if (!anchor) {
        left = x;
        top = y;
        if (left + w > vw - EDGE) { left = x - w >= EDGE ? x - w : Math.max(EDGE, vw - w - EDGE); ox = 'right'; }
        if (top + h > vh - EDGE) { top = y - h >= EDGE ? y - h : Math.max(EDGE, vh - h - EDGE); oy = 'bottom'; }
      } else {
        const cs = getComputedStyle(menu);
        const inset = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.borderTopWidth) || 0);
        left = anchor.right - 2;
        top = anchor.top - inset;
        if (left + w > vw - EDGE) { left = anchor.left - w + 2 >= EDGE ? anchor.left - w + 2 : Math.max(EDGE, vw - w - EDGE); ox = 'right'; }
        if (top + h > vh - EDGE) top = Math.max(EDGE, vh - h - EDGE);
      }
      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = `${Math.round(top)}px`;
      menu.style.setProperty('--fc-origin', `${oy} ${ox}`);
    }

    _hover(row, depth) {
      this._setFocus(depth, row, false);
      this._cancelClose(depth);
      const lvl = this.levels[depth];
      if (!lvl) return;
      clearTimeout(this.openTimer);
      if (hasSub(row._item) && row.getAttribute('aria-disabled') !== 'true') {
        if (lvl.openRow === row) { this._cancelClose(depth + 1); return; }
        const delay = this.levels.length > depth + 1 ? SWITCH_DELAY : OPEN_DELAY;
        this.openTimer = setTimeout(() => this._openSub(row, depth), delay);
      } else if (this.levels.length > depth + 1) {
        this._scheduleClose(depth + 1);
      }
    }

    _scheduleClose(depth) {
      if (this.closeDepth !== -1 && this.closeDepth <= depth) return; // a shallower close is already pending
      clearTimeout(this.closeTimer);
      this.closeDepth = depth;
      this.closeTimer = setTimeout(() => { this.closeDepth = -1; this._closeFrom(depth); }, CLOSE_DELAY);
    }

    // Being inside level `depth` keeps levels 0..depth alive.
    _cancelClose(depth) {
      if (this.closeDepth !== -1 && this.closeDepth <= depth) {
        clearTimeout(this.closeTimer);
        this.closeDepth = -1;
      }
    }

    _closeFrom(depth) {
      if (depth <= 0) { this.close(false); return; }
      while (this.levels.length > depth) this.levels.pop().el.remove();
      const parent = this.levels[depth - 1];
      if (parent) parent.openRow = null;
    }

    _openSub(row, depth) {
      if (!this.opts || !this.levels[depth]) return null;
      this._closeFrom(depth + 1);
      const kids = this.opts.children(row._item);
      if (!kids || !kids.length) return null;
      const sub = this._build(kids, depth + 1);
      this.root.append(sub);
      this._place(sub, 0, 0, row.getBoundingClientRect());
      this.levels.push({ el: sub, openRow: null });
      this.levels[depth].openRow = row;
      row.classList.add('focused');
      return sub;
    }

    _openSubAndFocus(row, depth) {
      const lvl = this.levels[depth];
      const sub = lvl.openRow === row && this.levels[depth + 1] ? this.levels[depth + 1].el : this._openSub(row, depth);
      if (sub) this._focusEdge(depth + 1, 1);
    }

    _activate(row, depth) {
      if (isBar(row)) {
        const b = row.querySelector('.bar-btn.focused') || barButtons(row)[0];
        if (b && this.opts && this.opts.onActivate) this.opts.onActivate(b._item);
        return;
      }
      if (row.getAttribute('aria-disabled') === 'true') return;
      const it = row._item;
      if (hasSub(it)) { this._openSubAndFocus(row, depth); return; }
      if (this.opts && this.opts.onActivate) this.opts.onActivate(it);
    }

    _rows(depth) {
      const lvl = this.levels[depth];
      return lvl ? [...lvl.el.querySelectorAll('.item, .bar')].filter((r) => (isBar(r) ? barButtons(r).length > 0 : r.getAttribute('aria-disabled') !== 'true')) : [];
    }
    _focused(depth) {
      const lvl = this.levels[depth];
      return lvl ? lvl.el.querySelector('.item.focused, .bar.focused') : null;
    }
    _setFocus(depth, row, scroll = true) {
      const lvl = this.levels[depth];
      if (!lvl) return;
      for (const r of lvl.el.querySelectorAll('.item.focused, .bar.focused')) {
        if (r === row) continue;
        r.classList.remove('focused');
        if (isBar(r)) r.querySelectorAll('.bar-btn.focused').forEach((b) => b.classList.remove('focused'));
      }
      if (row) {
        row.classList.add('focused');
        if (isBar(row) && !row.querySelector('.bar-btn.focused') && scroll) this._barFocus(row, barButtons(row)[0]);
        if (scroll) row.scrollIntoView({ block: 'nearest' });
      }
    }
    _barFocus(bar, btn) {
      bar.querySelectorAll('.bar-btn').forEach((b) => b.classList.toggle('focused', b === btn));
    }
    _barMove(bar, dir) {
      const btns = barButtons(bar);
      if (!btns.length) return;
      const cur = btns.indexOf(bar.querySelector('.bar-btn.focused'));
      this._barFocus(bar, btns[cur === -1 ? 0 : (cur + dir + btns.length) % btns.length]);
    }
    _focusEdge(depth, dir) {
      const rows = this._rows(depth);
      if (rows.length) this._setFocus(depth, dir > 0 ? rows[0] : rows[rows.length - 1]);
    }
    _move(depth, dir) {
      const rows = this._rows(depth);
      if (!rows.length) return;
      const cur = rows.indexOf(this._focused(depth));
      const next = cur === -1 ? (dir > 0 ? 0 : rows.length - 1) : (cur + dir + rows.length) % rows.length;
      this._setFocus(depth, rows[next]);
    }
    // Windows-style type-to-select: repeated letters cycle, typed words narrow down.
    _typeahead(depth, ch) {
      const lang = (FC.i18n && FC.i18n.lang) || undefined;
      const now = performance.now();
      if (now - this.typedAt > 700) this.typed = '';
      this.typedAt = now;
      const c = ch.toLocaleLowerCase(lang);
      const repeating = this.typed.length > 0 && [...this.typed].every((x) => x === c);
      this.typed += c;
      const prefix = repeating ? c : this.typed;
      const rows = this._rows(depth);
      const cur = rows.indexOf(this._focused(depth));
      const start = repeating || this.typed.length === 1 ? cur + 1 : Math.max(cur, 0);
      for (let i = 0; i < rows.length; i++) {
        const r = rows[(start + i) % rows.length];
        const label = r.querySelector('.label');
        if (label && label.textContent.toLocaleLowerCase(lang).startsWith(prefix)) { this._setFocus(depth, r); return; }
      }
    }
  }

  // Static, non-interactive rendering for previews.
  MenuView.renderStatic = function (root, items, o) {
    const menu = buildMenu(items, o);
    const rows = [...menu.querySelectorAll('.item')];
    if (o.focusIndex != null && rows[o.focusIndex]) rows[o.focusIndex].classList.add('focused');
    root.append(menu);
    return menu;
  };

  FC.MenuView = MenuView;
})(self);
