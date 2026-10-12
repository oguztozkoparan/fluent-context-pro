// FluentContext Pro — runs at document_start in the top frame only.
// Applies per-site forced dark mode before the page paints, to avoid a white flash.
(function (g) {
  'use strict';
  const FC = (g.FC = g.FC || {});
  if (FC.dark) return;
  const ID = 'fluent-context-dark';
  // Invert the page, then invert media back so photos and video keep their colours.
  // Our own layer lives in the top layer (or re-inverts itself) so the menu is unaffected.
  const CSS = [
    'html{filter:invert(1) hue-rotate(180deg)!important;background:#fff!important}',
    'img,video,picture,canvas,iframe,embed,object,svg image,[style*="background-image"]{filter:invert(1) hue-rotate(180deg)!important}',
    'fluent-context:not(:popover-open){filter:invert(1) hue-rotate(180deg)!important}'
  ].join('\n');

  FC.dark = {
    isOn: () => !!document.getElementById(ID),
    apply(on) {
      const existing = document.getElementById(ID);
      if (on && !existing) {
        const s = document.createElement('style');
        s.id = ID;
        s.textContent = CSS;
        (document.head || document.documentElement).append(s);
      } else if (!on && existing) {
        existing.remove();
      }
    }
  };

  const api = FC.api;
  const area = api && api.storage ? api.storage.sync || api.storage.local : null;
  if (!area) return;
  area.get('darkSites').then((r) => {
    if (FC.util.hostMatches(r && r.darkSites, location.hostname)) FC.dark.apply(true);
  }, () => {});
})(self);
