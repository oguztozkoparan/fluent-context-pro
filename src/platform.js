// FluentContext Pro — platform detection.
// Runs in pages, content scripts and the background worker (no DOM access at load time).
(function (g) {
  'use strict';
  const FC = (g.FC = g.FC || {});
  if (FC.platform) return;

  // Firefox/Safari expose promise-based `browser`; Chromium exposes `chrome` (promises in MV3).
  const api = g.browser && g.browser.runtime ? g.browser : g.chrome;
  const nav = g.navigator || {};
  const ua = nav.userAgent || '';
  const uaPlatform = (nav.userAgentData && nav.userAgentData.platform) || nav.platform || '';
  const probe = `${uaPlatform} ${ua}`.toLowerCase();

  function detectOS() {
    if (/android/.test(probe)) return 'android';
    if (/iphone|ipad|ipod/.test(probe)) return 'ios';
    if (/cros|chrome os|chromeos/.test(probe)) return 'chromeos';
    if (/mac/.test(probe)) return nav.maxTouchPoints > 1 ? 'ios' : 'macos'; // iPadOS reports "Macintosh"
    if (/win/.test(probe)) return 'windows';
    if (/linux|x11|bsd/.test(probe)) return 'linux';
    return 'other';
  }

  function detectBrowser() {
    const brands = ((nav.userAgentData && nav.userAgentData.brands) || []).map((b) => b.brand).join(' ');
    if (/Edg(e|A|iOS)?\//.test(ua) || /Microsoft Edge/.test(brands)) return 'edge';
    if (/OPR\/|Opera/.test(`${brands} ${ua}`)) return 'opera';
    if (/Firefox\//.test(ua)) return 'firefox';
    if (/Chrom(e|ium)/.test(`${brands} ${ua}`)) return 'chrome';
    if (/Safari\//.test(ua)) return 'safari';
    return 'other';
  }

  const os = detectOS();
  const browser = detectBrowser();
  const isMac = os === 'macos' || os === 'ios';
  // Visual family used when the style setting is "auto".
  const variant = os === 'windows' ? 'windows' : isMac ? 'macos' : 'linux';

  // Shortcut labels always follow the real OS, whatever look the user picks.
  const keys = isMac
    ? { copy: '⌘C', back: '⌘[', forward: '⌘]', reload: '⌘R', print: '⌘P' }
    : { copy: 'Ctrl+C', back: 'Alt+←', forward: 'Alt+→', reload: 'Ctrl+R', print: 'Ctrl+P' };

  const FONTS = {
    windows: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
    macos: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif',
    linux: '"Adwaita Sans", Cantarell, Ubuntu, "Noto Sans", "DejaVu Sans", "Liberation Sans", system-ui, sans-serif'
  };

  FC.api = api;
  FC.platform = {
    os,
    browser,
    variant,
    isMac,
    isFirefox: browser === 'firefox',
    keys,
    systemFont: (v) => FONTS[v] || FONTS[variant],
    isTouch: () => !!(g.matchMedia && g.matchMedia('(pointer: coarse)').matches)
  };
})(self);
