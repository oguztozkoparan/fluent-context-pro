// FluentContext Pro — visual system shared by the in-page menu and the settings preview.
// The stylesheet is static; settings only change CSS custom properties and data-* switches.
(function (g) {
  'use strict';
  const FC = (g.FC = g.FC || {});
  if (FC.theme) return;
  const U = FC.util;
  const P = FC.platform;

  const FONTS = {
    segoe: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
    sf: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif',
    inter: 'Inter, "Inter Variable", system-ui, sans-serif',
    roboto: 'Roboto, "Noto Sans", system-ui, sans-serif',
    mono: 'ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace'
  };
  const FONT_LABELS = { segoe: 'Segoe UI', sf: 'San Francisco', inter: 'Inter', roboto: 'Roboto', mono: 'Monospace' };

  // Menu surface colours per platform family.
  const SURFACE = {
    windows: { dark: '44, 44, 44', light: '249, 249, 249' },
    macos: { dark: '40, 40, 42', light: '240, 240, 242' },
    linux: { dark: '54, 54, 58', light: '255, 255, 255' }
  };
  const DENSITY = {
    compact: { pad: '3px 10px', h: 24 },
    normal: { pad: '6px 12px', h: 30 },
    comfortable: { pad: '8px 14px', h: 36 }
  };
  const MENU_PAD = { windows: '4px', macos: '5px', linux: '6px' };
  const SEP_MARGIN = { windows: '4px 6px', macos: '5px 10px', linux: '6px 8px' };

  const resolveVariant = (cfg) => (cfg.platformStyle && cfg.platformStyle !== 'auto' ? cfg.platformStyle : P.variant);
  const resolveDark = (cfg) => {
    if (cfg.theme === 'dark') return true;
    if (cfg.theme === 'light') return false;
    return !!(g.matchMedia && g.matchMedia('(prefers-color-scheme: dark)').matches);
  };
  const fontStack = (key, variant) => FONTS[key] || P.systemFont(variant);
  const animMs = (cfg) => (cfg.animStyle === 'none' ? 0 : U.clamp(U.num(cfg.animDuration, 150), 0, 600));

  // White or near-black text, whichever reads better on the accent colour.
  function onAccent(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return L > 0.45 ? '#111111' : '#ffffff';
  }

  function vars(cfg) {
    const variant = resolveVariant(cfg);
    const dark = resolveDark(cfg);
    const op = U.clamp(U.num(cfg.bgOpacity, 0.85), 0.2, 1);
    const blur = U.clamp(U.num(cfg.blurVal, 0), 0, 60);
    const radius = U.clamp(U.num(cfg.borderRadius, 8), 0, 24);
    const sh = U.clamp(U.num(cfg.shadowIntensity, 0.4), 0, 1);
    const accent = /^#[0-9a-f]{6}$/i.test(cfg.accentColor) ? cfg.accentColor : '#0078d4';
    const dens = DENSITY[cfg.density] || DENSITY.normal;
    const fs = U.clamp(U.num(cfg.fontSize, 13), 10, 20);
    return {
      '--fc-accent': accent,
      '--fc-on-accent': onAccent(accent),
      '--fc-bg': `rgba(${SURFACE[variant][dark ? 'dark' : 'light']}, ${op})`,
      '--fc-blur': blur ? `blur(${blur}px) saturate(170%)` : 'none',
      '--fc-text': dark ? '#f5f5f5' : '#1b1b1b',
      '--fc-muted': dark ? 'rgba(255,255,255,.56)' : 'rgba(0,0,0,.52)',
      '--fc-hover': dark ? 'rgba(255,255,255,.085)' : 'rgba(0,0,0,.055)',
      '--fc-border': variant === 'linux' ? (dark ? 'rgba(0,0,0,.5)' : 'rgba(0,0,0,.14)') : dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.1)',
      '--fc-sep': dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.09)',
      '--fc-shadow': `0 ${Math.round(4 + 12 * sh)}px ${Math.round(12 + 28 * sh)}px rgba(0,0,0,${(sh * (dark ? 0.9 : 0.5)).toFixed(2)}), 0 1px 3px rgba(0,0,0,${(sh * 0.35).toFixed(2)})`,
      '--fc-radius': `${radius}px`,
      '--fc-item-radius': `${Math.max(2, Math.round(radius * 0.55))}px`,
      '--fc-font': fontStack(cfg.fontFamily, variant),
      '--fc-font-size': `${fs}px`,
      '--fc-min-w': `${U.clamp(U.num(cfg.menuWidth, 220), 140, 400)}px`,
      '--fc-item-pad': dens.pad,
      '--fc-item-h': `${dens.h}px`,
      '--fc-menu-pad': MENU_PAD[variant],
      '--fc-sep-margin': SEP_MARGIN[variant],
      '--fc-anim': `${animMs(cfg)}ms`
    };
  }

  function apply(root, cfg) {
    for (const [k, v] of Object.entries(vars(cfg))) root.style.setProperty(k, v);
    const dark = resolveDark(cfg);
    root.style.colorScheme = dark ? 'dark' : 'light';
    root.dataset.variant = resolveVariant(cfg);
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.icons = cfg.showIcons === false ? 'off' : 'on';
    root.dataset.shortcuts = cfg.showShortcuts === false ? 'off' : 'on';
    root.dataset.anim = cfg.animStyle || 'scale';
    root.dataset.animMs = String(animMs(cfg));
  }

  const CSS = `
:host { all: initial !important; }
.fc-root {
  position: fixed; left: 0; top: 0; width: 0; height: 0; overflow: visible; pointer-events: none;
  font-family: var(--fc-font); font-size: var(--fc-font-size); line-height: 1.35; color: var(--fc-text);
  text-align: left; direction: ltr; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%; text-size-adjust: 100%;
}
.fc-root.static { position: relative; width: auto; height: auto; }
.fc-root *, .fc-root *::before, .fc-root *::after { box-sizing: border-box; }

/* ---------- Menu ---------- */
.menu {
  position: fixed; pointer-events: auto; outline: none; user-select: none; -webkit-user-select: none;
  background: var(--fc-bg); -webkit-backdrop-filter: var(--fc-blur); backdrop-filter: var(--fc-blur);
  border: 1px solid var(--fc-border); border-radius: var(--fc-radius); box-shadow: var(--fc-shadow);
  padding: var(--fc-menu-pad); min-width: var(--fc-min-w); max-width: min(380px, calc(100vw - 16px));
  max-height: calc(100vh - 16px); overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain;
  scrollbar-width: thin; transform-origin: var(--fc-origin, top left);
  animation: fc-scale var(--fc-anim) cubic-bezier(.2, 0, 0, 1) both;
}
.fc-root[data-anim="slide"] .menu { animation-name: fc-slide; }
.fc-root[data-anim="fade"] .menu { animation-name: fc-fade; }
.fc-root[data-anim="none"] .menu, .fc-root.static .menu { animation: none; }
.fc-root.static .menu { position: relative; width: max-content; max-width: 100%; }
.menu.closing { animation: fc-out var(--fc-anim) ease-in forwards !important; pointer-events: none; }
@keyframes fc-scale { from { opacity: 0; transform: scale(.96) translateY(-4px); } }
@keyframes fc-slide { from { opacity: 0; transform: translateY(-8px); } }
@keyframes fc-fade { from { opacity: 0; } }
@keyframes fc-out { to { opacity: 0; } }

.item {
  position: relative; display: flex; align-items: center; justify-content: space-between; gap: 18px;
  min-height: var(--fc-item-h); padding: var(--fc-item-pad); border-radius: var(--fc-item-radius);
  white-space: nowrap; cursor: default;
}
.item.focused { background: var(--fc-hover); }
.item[aria-disabled="true"] { opacity: .42; }
.item[aria-disabled="true"].focused { background: transparent; }
.item-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.label { overflow: hidden; text-overflow: ellipsis; }
.icon { width: 16px; height: 16px; flex: none; display: flex; align-items: center; justify-content: center; opacity: .85; }
.icon svg, .chevron svg, .check svg { width: 100%; height: 100%; }
.icon:empty { opacity: 0; }
.fc-root[data-icons="off"] .icon { display: none; }
.item-right { display: flex; align-items: center; gap: 6px; color: var(--fc-muted); font-size: calc(var(--fc-font-size) - 1.5px); }
.fc-root[data-shortcuts="off"] .shortcut { display: none; }
.chevron, .check { width: 14px; height: 14px; display: flex; }
.check { color: var(--fc-accent); }
.item.checked .icon { color: var(--fc-accent); opacity: 1; }
.sep { height: 1px; background: var(--fc-sep); margin: var(--fc-sep-margin); }

/* Icon command bar (navigation) */
.bar { display: flex; gap: 2px; }
.bar-btn {
  flex: 1 1 0; min-width: 34px; height: var(--fc-item-h); padding: 0; margin: 0; border: 0; font: inherit;
  display: flex; align-items: center; justify-content: center; cursor: default;
  background: transparent; color: var(--fc-text); border-radius: var(--fc-item-radius);
}
.bar-btn svg { width: 16px; height: 16px; opacity: .85; pointer-events: none; }
.bar-btn.focused { background: var(--fc-hover); }
.bar-btn:disabled { opacity: .38; }
.fc-root[data-variant="macos"] .bar-btn.focused { background: var(--fc-accent); color: var(--fc-on-accent); }
.fc-root[data-variant="macos"] .bar-btn.focused svg { opacity: 1; }

/* Windows 11 / Fluent: subtle fill + accent pill */
.fc-root[data-variant="windows"] .item.focused:not([aria-disabled="true"])::before {
  content: ''; position: absolute; left: 0; top: 50%; width: 3px; height: 16px; margin-top: -8px;
  border-radius: 3px; background: var(--fc-accent);
}
/* macOS: full accent highlight with contrasting text */
.fc-root[data-variant="macos"] .item.focused:not([aria-disabled="true"]) { background: var(--fc-accent); color: var(--fc-on-accent); }
.fc-root[data-variant="macos"] .item.focused:not([aria-disabled="true"]) .item-right,
.fc-root[data-variant="macos"] .item.focused:not([aria-disabled="true"]) .check,
.fc-root[data-variant="macos"] .item.focused:not([aria-disabled="true"]) .icon { color: var(--fc-on-accent); opacity: 1; }
.fc-root[data-variant="macos"] .item { gap: 24px; }
/* GNOME / libadwaita: plain rounded hover, slightly heavier weight */
.fc-root[data-variant="linux"] .item.focused { background: var(--fc-hover); }
.fc-root[data-variant="linux"] .label { font-weight: 450; }

@media (pointer: coarse) {
  .item { min-height: 40px; padding-top: 10px; padding-bottom: 10px; }
  .menu { max-width: calc(100vw - 16px); }
}

/* ---------- Toasts ---------- */
.toasts { position: fixed; right: 16px; bottom: 16px; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; pointer-events: none; }
.toast, .panel {
  background: var(--fc-bg); -webkit-backdrop-filter: var(--fc-blur); backdrop-filter: var(--fc-blur);
  border: 1px solid var(--fc-border); border-radius: var(--fc-radius); box-shadow: var(--fc-shadow); color: var(--fc-text);
}
.toast {
  pointer-events: auto; display: flex; align-items: center; gap: 10px; max-width: min(380px, calc(100vw - 32px));
  padding: 10px 14px; animation: fc-rise 180ms cubic-bezier(.2, 0, 0, 1) both;
}
.toast.out { animation: fc-sink 160ms ease-in forwards; }
.toast .icon { opacity: 1; }
.toast.success .icon { color: #16a34a; }
.toast.error .icon { color: #dc2626; }
.toast.info .icon, .toast.loading .icon { color: var(--fc-accent); }
.toast.loading .icon svg { animation: fc-spin 1s linear infinite; }
@keyframes fc-rise { from { opacity: 0; transform: translateY(8px); } }
@keyframes fc-sink { to { opacity: 0; transform: translateY(8px); } }
@keyframes fc-spin { to { transform: rotate(360deg); } }

/* ---------- Result panel ---------- */
.panel {
  position: fixed; top: 16px; right: 16px; width: 440px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px);
  display: flex; flex-direction: column; pointer-events: auto; animation: fc-drop 180ms cubic-bezier(.2, 0, 0, 1) both;
}
@keyframes fc-drop { from { opacity: 0; transform: translateY(-8px); } }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px 10px 14px; border-bottom: 1px solid var(--fc-sep); font-weight: 600; cursor: grab; touch-action: none; }
.panel-head:active { cursor: grabbing; }
.panel-body { padding: 12px 14px; overflow: auto; white-space: pre-wrap; word-break: break-word; line-height: 1.55; user-select: text; -webkit-user-select: text; min-height: 48px; }
.panel-body.center { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
.panel-body .qr { width: min(260px, 70vw); aspect-ratio: 1; background: #fff; border-radius: 8px; padding: 6px; }
.panel-body .qr svg { width: 100%; height: 100%; display: block; }
.panel-body .caption { color: var(--fc-muted); font-size: calc(var(--fc-font-size) - 1px); word-break: break-all; }
.panel-body .muted { color: var(--fc-muted); }
.panel-body.streaming::after { content: '▍'; display: inline-block; margin-left: 1px; color: var(--fc-accent); animation: fc-blink 1s steps(2) infinite; }
@keyframes fc-blink { 50% { opacity: 0; } }
.panel-foot { display: flex; gap: 8px; justify-content: flex-end; padding: 10px 12px; border-top: 1px solid var(--fc-sep); }
.btn {
  display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; font: inherit; color: var(--fc-text);
  background: transparent; border: 1px solid var(--fc-border); border-radius: max(4px, calc(var(--fc-radius) - 2px)); cursor: pointer;
}
.btn:hover { background: var(--fc-hover); }
.btn:focus-visible, .icon-btn:focus-visible { outline: 2px solid var(--fc-accent); outline-offset: 1px; }
.btn.primary { background: var(--fc-accent); color: var(--fc-on-accent); border-color: transparent; }
.btn.primary:hover { filter: brightness(1.08); }
.btn[hidden] { display: none; }
.btn .icon { width: 14px; height: 14px; }
.icon-btn { display: flex; padding: 4px; border: 0; border-radius: 4px; background: transparent; color: var(--fc-muted); cursor: pointer; }
.icon-btn:hover { background: var(--fc-hover); color: var(--fc-text); }
.icon-btn svg { width: 16px; height: 16px; }

@media (prefers-reduced-motion: reduce) {
  .menu, .toast, .panel { animation-duration: 1ms !important; }
  .toast.loading .icon svg, .panel-body.streaming::after { animation: none; }
}
`;

  FC.theme = { CSS, FONTS, FONT_LABELS, vars, apply, resolveVariant, resolveDark, animMs };
})(self);
