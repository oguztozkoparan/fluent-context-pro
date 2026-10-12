// FluentContext Pro — the in-page layer: a closed shadow root holding the menu, toasts and panels.
// Uses the Popover API when available so the layer sits in the browser's top layer (above
// fullscreen elements, modal dialogs and z-index wars); falls back to a fixed element otherwise.
(function (g) {
  'use strict';
  const FC = (g.FC = g.FC || {});
  if (FC.Host) return;
  const I = FC.icons;
  const h = FC.util.h;
  const t = (k, v) => FC.i18n.t(k, v);
  const HAS_POPOVER = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

  const HOST_CSS = [
    'all: initial', 'display: block', 'position: fixed', 'inset: 0 auto auto 0', 'width: 0', 'height: 0',
    'margin: 0', 'padding: 0', 'border: 0', 'overflow: visible', 'background: transparent',
    'color-scheme: normal', 'z-index: 2147483647', 'pointer-events: none', 'opacity: 1', 'visibility: visible',
    'transform: none', 'filter: none', 'contain: none'
  ].map((d) => `${d} !important`).join(';');

  class Host {
    constructor(getCfg) {
      this.getCfg = getCfg;
      this.el = null;
      this.root = null;
      this.view = null;
      this.panelEl = null;
    }

    ensure() {
      if (this.el && this.el.isConnected) return this;
      // A custom tag keeps page rules written for div/span away from our host.
      const el = document.createElement('fluent-context');
      el.setAttribute('style', HOST_CSS);
      if (HAS_POPOVER) el.setAttribute('popover', 'manual');
      const shadow = el.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = FC.theme.CSS;
      const root = document.createElement('div');
      root.className = 'fc-root';
      shadow.append(style, root);
      document.documentElement.append(el);
      this.el = el;
      this.shadow = shadow;
      this.root = root;
      this.view = new FC.MenuView(root);
      this.refreshTheme();
      this.raise();
      return this;
    }

    // Re-enter the top layer so we stay above popovers/fullscreen opened after us.
    raise() {
      if (!HAS_POPOVER || !this.el) return;
      try {
        if (this.el.matches(':popover-open')) this.el.hidePopover();
        this.el.showPopover();
      } catch (e) { /* not connected yet or unsupported */ }
    }

    refreshTheme() {
      if (this.root) FC.theme.apply(this.root, this.getCfg());
    }

    // ---------- Toasts ----------
    toast(message, kind = 'info', duration = 2600) {
      this.ensure();
      this.raise();
      let wrap = this.root.querySelector('.toasts');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'toasts';
        wrap.setAttribute('role', 'status');
        wrap.setAttribute('aria-live', 'polite');
        this.root.append(wrap);
      }
      const el = document.createElement('div');
      el.className = `toast ${kind}`;
      const icon = { success: I.check, error: I.alert, loading: I.loader }[kind] || I.info;
      el.append(h('span', { class: 'icon' }, FC.svgNode(icon)), h('span', { class: 'msg', text: message }));
      wrap.append(el);
      const dismiss = () => { el.classList.add('out'); setTimeout(() => el.remove(), 180); };
      if (duration > 0) setTimeout(dismiss, duration);
      return { el, dismiss, update: (m) => { el.querySelector('.msg').textContent = m; } };
    }

    // ---------- Panel ----------
    // opts: { title, text, qrSvg, caption, copyText, streaming, onStop, onCopy }
    panel(opts) {
      this.ensure();
      this.raise();
      this.closePanel();
      const p = document.createElement('div');
      p.className = 'panel';
      p.setAttribute('role', 'dialog');
      p.setAttribute('aria-label', opts.title);
      p.append(
        h('div', { class: 'panel-head' },
          h('span', { class: 'title', text: opts.title }),
          h('button', { class: 'icon-btn', type: 'button', 'data-act': 'close', title: t('close'), 'aria-label': t('close') }, FC.svgNode(I.x))),
        h('div', { class: 'panel-body' }),
        h('div', { class: 'panel-foot' },
          h('button', { class: 'btn', type: 'button', 'data-act': 'stop', hidden: true }, h('span', { class: 'icon' }, FC.svgNode(I.stop)), h('span', { text: t('stop') })),
          h('button', { class: 'btn', type: 'button', 'data-act': 'close', text: t('close') }),
          h('button', { class: 'btn primary', type: 'button', 'data-act': 'copy' }, h('span', { class: 'icon' }, FC.svgNode(I.copy)), h('span', { text: t('copyBtn') }))));
      const body = p.querySelector('.panel-body');
      const stopBtn = p.querySelector('[data-act="stop"]');
      const copyBtn = p.querySelector('[data-act="copy"]');
      let text = opts.text || '';

      if (opts.qrSvg) {
        body.classList.add('center');
        const box = document.createElement('div');
        box.className = 'qr';
        box.append(FC.svgNode(opts.qrSvg));
        const cap = document.createElement('div');
        cap.className = 'caption';
        cap.textContent = opts.caption || '';
        body.append(box, cap);
      } else {
        body.textContent = text;
      }
      if (opts.streaming) {
        body.classList.add('streaming');
        stopBtn.hidden = false;
        copyBtn.disabled = true;
        if (!text) FC.util.clear(body).append(h('span', { class: 'muted', text: t('llmWaiting') }));
      }

      const close = () => { if (opts.onStop && !handle.finished) opts.onStop(); p.remove(); if (this.panelEl === p) this.panelEl = null; };
      p.addEventListener('pointerdown', (e) => e.stopPropagation());
      p.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', close));
      stopBtn.addEventListener('click', () => { if (opts.onStop) opts.onStop(); handle.done(t('llmStopped')); });
      copyBtn.addEventListener('click', () => opts.onCopy && opts.onCopy(opts.copyText != null ? opts.copyText : text));
      this._makeDraggable(p, p.querySelector('.panel-head'));

      this.root.append(p);
      this.panelEl = p;
      copyBtn.focus({ preventScroll: true });

      const handle = {
        finished: !opts.streaming,
        append(chunk) {
          if (!text) body.textContent = '';
          text += chunk;
          body.textContent = text;
          body.scrollTop = body.scrollHeight;
        },
        done(note) {
          handle.finished = true;
          body.classList.remove('streaming');
          stopBtn.hidden = true;
          copyBtn.disabled = !text;
          if (note && !text) body.textContent = note;
        },
        fail(message) {
          handle.finished = true;
          body.classList.remove('streaming');
          stopBtn.hidden = true;
          body.textContent = text ? `${text}\n\n— ${message}` : message;
          copyBtn.disabled = !text;
        },
        close
      };
      return handle;
    }

    closePanel() {
      if (!this.panelEl) return false;
      this.panelEl.querySelector('.panel-foot [data-act="close"]').click();
      return true;
    }

    _makeDraggable(panel, handle) {
      handle.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button') || e.button !== 0) return;
        const r = panel.getBoundingClientRect();
        const dx = e.clientX - r.left;
        const dy = e.clientY - r.top;
        handle.setPointerCapture(e.pointerId);
        const move = (ev) => {
          const vw = document.documentElement.clientWidth;
          const vh = document.documentElement.clientHeight;
          panel.style.left = `${Math.min(Math.max(0, ev.clientX - dx), vw - 60)}px`;
          panel.style.top = `${Math.min(Math.max(0, ev.clientY - dy), vh - 40)}px`;
          panel.style.right = 'auto';
        };
        const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
      });
    }
  }

  FC.Host = Host;
})(self);
