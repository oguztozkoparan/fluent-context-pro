// FluentContext Pro — the single source of truth for menu items.
// The content script renders these, the settings page lists them, and config derives defaults from them.
//
// Item fields:
//   id        unique key; also the i18n label key unless `raw`/`text` is set
//   group     root items only; a separator is drawn wherever the group changes
//   icon, shortcut
//   when(ctx, env)     visibility (uses only serialisable ctx fields)
//   checked(ctx), disabled(ctx), label(ctx) → i18n key
//   scope     'frame' → needs live DOM elements, runs in the frame that was clicked
//             'top'   → runs in the top-level page
//             (none)  → runs wherever the menu is shown
//   secondary  in the compact layout, grouped under a "More …" submenu of its group
//   defaultOff, hideInSettings
//   children  static sub-items;  extra(ctx, env) appends dynamic sub-items
//   run(ctx, env)
(function (g) {
  'use strict';
  const FC = (g.FC = g.FC || {});
  const U = FC.util;
  const enc = encodeURIComponent;
  const SEP = { type: 'separator' };
  const EMAIL = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;
  const PHONE = /^\+?[\d\s().-]{7,20}$/;
  const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

  const sel = (c) => !!c.selection;
  const link = (c) => !!c.link;
  const img = (c) => !!c.image;
  const vid = (c) => !!c.video;

  FC.buildItems = function ({ icons: I, keys: K }) {
    I = I || {};
    K = K || {};
    return [
      // ---------- Selected text ----------
      { id: 'copy', group: 'text', icon: I.copy, shortcut: K.copy, when: sel, run: (c, e) => e.copy(c.selection) },
      { id: 'search', group: 'text', icon: I.search, when: sel, run: (c, e) => e.open(e.searchUrl(c.selection)) },
      {
        id: 'translate', group: 'text', icon: I.languages, when: sel,
        run: (c, e) => e.open(`https://translate.google.com/?sl=auto&tl=${enc(e.targetLang())}&text=${enc(c.selection)}&op=translate`)
      },
      {
        id: 'textTools', group: 'text', icon: I.type, when: sel,
        children: [
          { id: 'toUpper', icon: I.caseUpper, run: (c, e) => e.copy(c.selection.toLocaleUpperCase(U.safeLocale(c.lang))) },
          { id: 'toLower', icon: I.caseLower, run: (c, e) => e.copy(c.selection.toLocaleLowerCase(U.safeLocale(c.lang))) },
          { id: 'toTitle', icon: I.type, run: (c, e) => e.copy(U.titleCase(c.selection, c.lang)) },
          SEP,
          { id: 'searchQuoted', icon: I.quote, run: (c, e) => e.open(e.searchUrl(`"${c.selection}"`)) },
          { id: 'wikipedia', icon: I.globe, run: (c, e) => e.open(`https://${e.uiLang()}.wikipedia.org/w/index.php?search=${enc(c.selection)}`) },
          SEP,
          {
            id: 'speak', icon: I.volume, when: (c) => c.caps.speech,
            label: (c) => (c.caps.speaking ? 'stopSpeak' : 'speak'),
            run: (c, e) => (c.caps.speaking ? e.stopSpeaking() : e.speak(c.selection, c.lang))
          },
          { id: 'openEmail', icon: I.mail, when: (c) => EMAIL.test(c.selection), run: (c, e) => e.launch(`mailto:${c.selection}`) },
          {
            id: 'callPhone', icon: I.phone,
            when: (c) => PHONE.test(c.selection) && c.selection.replace(/\D/g, '').length >= 6,
            run: (c, e) => e.launch(`tel:${c.selection.replace(/[^\d+]/g, '')}`)
          },
          SEP,
          {
            id: 'wordCount', icon: I.hash,
            run: (c, e) => e.toast(e.t('wordCountResult', { words: U.wordCount(c.selection, c.lang), chars: U.charCount(c.selection) }), 'info', 4000)
          }
        ]
      },
      {
        id: 'ai', group: 'text', icon: I.sparkles, when: sel,
        children: [
          { id: 'aiSummarize', icon: I.sparkles, run: (c, e) => e.llm(`Summarize the following text briefly in ${e.langName()}:\n\n${c.selection}`, e.t('summary')) },
          { id: 'aiExplain', icon: I.sparkles, run: (c, e) => e.llm(`Explain the following text in plain ${e.langName()}:\n\n${c.selection}`, e.t('explanation')) },
          {
            id: 'aiTranslate', icon: I.languages,
            run: (c, e) => e.llm(`Translate the following text into the language with code "${e.targetLang()}". Reply with the translation only.\n\n${c.selection}`, e.t('translation'))
          },
          SEP,
          {
            id: 'copyMarkdown', icon: I.fileText, scope: 'frame',
            run: (c, e) => { const md = U.selectionMarkdown(); return md ? e.copy(md, e.t('markdownCopied')) : e.toast(e.t('clipboardFailed'), 'error'); }
          }
        ],
        // User-defined AI prompts appear at the end of this submenu.
        extra: (c, e) => {
          const list = e.customItems('ai').map((ci, i) => ({
            id: `custom-ai-${i}`, raw: true, text: ci.label, icon: I.zap,
            run: (cc, ee) => ee.llm(U.fillPrompt(ci.template, cc.selection), ci.label)
          }));
          return list.length ? [SEP, ...list] : [];
        }
      },

      // ---------- Links ----------
      { id: 'openLink', group: 'link', icon: I.externalLink, when: link, run: (c, e) => e.open(c.link) },
      { id: 'openBackground', secondary: true, group: 'link', icon: I.layers, when: link, run: (c, e) => e.open(c.link, { background: true }) },
      {
        id: 'openIncognito', secondary: true, group: 'link', icon: I.incognito, when: link,
        run: async (c, e) => { const r = await e.send({ type: 'OPEN_INCOGNITO', url: c.link }); if (!r.ok) e.toast(e.t('incognitoFailed'), 'error', 6000); }
      },
      { id: 'copyLink', group: 'link', icon: I.link, when: link, run: (c, e) => e.copy(c.link, e.t('addressCopied')) },
      {
        id: 'copyCleanLink', secondary: true, group: 'link', icon: I.eraser, when: link,
        run: (c, e) => { const clean = U.cleanUrl(c.link); e.copy(clean, e.t(clean === c.link ? 'addressCopied' : 'cleanLinkCopied')); }
      },
      { id: 'copyLinkText', secondary: true, group: 'link', icon: I.type, when: (c) => link(c) && !!c.linkText, run: (c, e) => e.copy(c.linkText, e.t('textCopied')) },
      {
        id: 'copyLinkMd', secondary: true, group: 'link', icon: I.fileText, when: link,
        run: (c, e) => e.copy(`[${U.mdEscape(c.linkText || c.link)}](${c.link})`, e.t('mdLinkCopied'))
      },
      { id: 'saveLinkAs', secondary: true, group: 'link', icon: I.download, when: link, run: (c, e) => e.download(c.link, U.filenameFromUrl(c.link), true) },
      { id: 'linkQr', secondary: true, group: 'link', icon: I.qr, when: link, run: (c, e) => e.qr(c.link) },
      { id: 'linkArchive', secondary: true, group: 'link', icon: I.archive, when: (c) => link(c) && U.isHttpUrl(c.link), run: (c, e) => e.open(`https://web.archive.org/web/*/${c.link}`) },

      // ---------- Images ----------
      { id: 'copyImage', group: 'image', icon: I.image, when: img, run: (c, e) => e.copyImage(c.image) },
      { id: 'copyImageUrl', secondary: true, group: 'image', icon: I.link, when: img, run: (c, e) => e.copy(c.image, e.t('addressCopied')) },
      { id: 'openImage', secondary: true, group: 'image', icon: I.externalLink, when: (c) => img(c) && U.isHttpUrl(c.image), run: (c, e) => e.open(c.image) },
      { id: 'downloadImage', group: 'image', icon: I.download, when: img, run: (c, e) => e.download(c.image, U.filenameFromUrl(c.image), false) },
      {
        id: 'reverseImage', group: 'image', icon: I.search, when: (c) => img(c) && U.isHttpUrl(c.image),
        children: [
          { id: 'lens', icon: I.search, run: (c, e) => e.open(`https://lens.google.com/uploadbyurl?url=${enc(c.image)}`) },
          { id: 'yandexImg', icon: I.search, run: (c, e) => e.open(`https://yandex.com/images/search?rpt=imageview&url=${enc(c.image)}`) },
          { id: 'bingImg', icon: I.search, run: (c, e) => e.open(`https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${enc(c.image)}`) },
          { id: 'tineye', icon: I.search, run: (c, e) => e.open(`https://tineye.com/search?url=${enc(c.image)}`) }
        ]
      },
      { id: 'ocr', secondary: true, group: 'image', icon: I.scanText, when: img, run: (c, e) => e.ocr(c.image) },
      {
        id: 'comfy', secondary: true, group: 'image', icon: I.sparkles, when: img,
        run: async (c, e) => {
          let chunks;
          try { chunks = await U.pngTextChunks(new Uint8Array(await (await e.fetchBlob(c.image)).arrayBuffer())); } catch (err) { e.toast(e.t('corsError'), 'error'); return; }
          if (chunks === null) e.toast(e.t('notPng'), 'error');
          else if (!chunks.length) e.toast(e.t('noMetadata'), 'error');
          else e.copy(chunks.map((ch) => `${ch.key}:\n${ch.text}`).join('\n\n'), e.t('metadataCopied'));
        }
      },
      {
        id: 'imageInfo', secondary: true, group: 'image', icon: I.info, when: img, defaultOff: true,
        run: async (c, e) => {
          const i = c.imageInfo || {};
          let type = e.t('unknown'), size = e.t('unknown');
          try { const b = await e.fetchBlob(c.image); type = b.type || type; size = U.formatBytes(b.size, size); } catch (err) { /* unreadable */ }
          e.panel(e.t('imageInfoTitle'), [
            `${e.t('dimensions')}: ${i.w} × ${i.h} px`,
            `${e.t('naturalSize')}: ${i.nw} × ${i.nh} px`,
            `${e.t('fileType')}: ${type}`,
            `${e.t('fileSize')}: ${size}`,
            '',
            c.image
          ].join('\n'));
        }
      },
      {
        id: 'copyImageBase64', secondary: true, group: 'image', icon: I.binary, when: img, defaultOff: true,
        run: async (c, e) => { try { e.copy(await U.blobToDataUrl(await e.fetchBlob(c.image))); } catch (err) { e.toast(e.t('corsError'), 'error'); } }
      },

      // ---------- Video ----------
      {
        // Picture-in-Picture needs a user gesture inside the video's own frame, so it is hidden for relayed menus.
        id: 'pip', group: 'video', icon: I.pip, scope: 'frame', when: (c) => vid(c) && c.caps.pip && !c.remote,
        run: async (c, e) => {
          try {
            if (document.pictureInPictureElement) await document.exitPictureInPicture();
            else await c.el.video.requestPictureInPicture();
          } catch (err) { e.toast(e.t('pipFailed', { msg: err.message }), 'error'); }
        }
      },
      {
        id: 'videoSpeed', group: 'video', icon: I.gauge, when: vid,
        children: RATES.map((r) => ({
          id: `speed-${r}`, raw: true, text: `${r}×`, scope: 'frame', hideInSettings: true,
          checked: (c) => Math.abs(c.video.rate - r) < 0.01,
          run: (c) => { c.el.video.playbackRate = r; }
        }))
      },
      { id: 'videoLoop', secondary: true, group: 'video', icon: I.repeat, scope: 'frame', when: vid, checked: (c) => c.video.loop, run: (c) => { c.el.video.loop = !c.el.video.loop; } },
      {
        id: 'videoFrame', secondary: true, group: 'video', icon: I.camera, scope: 'frame', when: vid,
        run: async (c, e) => {
          try {
            const v = c.el.video;
            const canvas = document.createElement('canvas');
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            canvas.getContext('2d').drawImage(v, 0, 0);
            const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
            if (!blob) throw new Error('empty');
            await e.copyPng(blob, 'frameCopied');
          } catch (err) { e.toast(e.t('frameFailed'), 'error'); }
        }
      },
      {
        id: 'downloadVideo', secondary: true, group: 'video', icon: I.download, when: (c) => vid(c) && U.isHttpUrl(c.video.src),
        run: (c, e) => e.download(c.video.src, U.filenameFromUrl(c.video.src), false)
      },

      // ---------- Tools ----------
      {
        id: 'dev', group: 'tools', icon: I.code,
        children: [
          {
            id: 'tailwind', icon: I.braces, scope: 'frame',
            run: (c, e) => { const cls = U.collectClasses(c.el.target); return cls.length ? e.copy(cls.join(' '), e.t('classesCopied', { n: cls.length })) : e.toast(e.t('noClasses'), 'error'); }
          },
          { id: 'cssSelector', icon: I.code, scope: 'frame', run: (c, e) => e.copy(U.cssSelector(c.el.target), e.t('selectorCopied')) },
          { id: 'copyHtml', icon: I.fileCode, scope: 'frame', run: (c, e) => e.copy(c.el.target.outerHTML, e.t('htmlCopied')) },
          { id: 'elementStyle', icon: I.palette, scope: 'frame', run: (c, e) => e.panel(e.t('styleInfoTitle'), U.styleSummary(c.el.target)) },
          SEP,
          {
            id: 'hideElement', icon: I.eyeOff, scope: 'frame', defaultOff: true,
            run: (c, e) => { c.el.target.style.setProperty('visibility', 'hidden', 'important'); e.toast(e.t('elementHidden'), 'success'); }
          },
          { id: 'removeElement', icon: I.trash, scope: 'frame', defaultOff: true, run: (c, e) => { c.el.target.remove(); e.toast(e.t('elementRemoved'), 'success'); } },
          SEP,
          {
            id: 'copyMeta', icon: I.tags, scope: 'frame', defaultOff: true,
            run: (c, e) => {
              const metas = [...document.querySelectorAll('meta[name], meta[property]')]
                .map((m) => `${m.getAttribute('name') || m.getAttribute('property')}: ${m.getAttribute('content') || ''}`);
              e.copy(metas.join('\n'), e.t('metaCopied', { n: metas.length }));
            }
          },
          {
            id: 'clearStorage', icon: I.database, scope: 'frame', defaultOff: true,
            run: (c, e) => { try { localStorage.clear(); sessionStorage.clear(); e.toast(e.t('storageCleared'), 'success'); } catch (err) { e.toast(err.message, 'error'); } }
          },
          {
            id: 'viewSource', icon: I.fileCode, defaultOff: true, when: (c) => U.isHttpUrl(c.pageUrl),
            run: async (c, e) => { const r = await e.send({ type: 'OPEN_TAB', url: `view-source:${c.pageUrl}` }); if (!r.ok) e.toast(e.t('tabActionFailed', { msg: r.error }), 'error'); }
          },
          SEP,
          { id: 'pageUrl', icon: I.link, run: (c, e) => e.copy(c.pageUrl, e.t('urlCopied')) },
          { id: 'pageMd', icon: I.fileText, run: (c, e) => e.copy(`[${U.mdEscape(c.pageTitle || c.pageUrl)}](${c.pageUrl})`, e.t('mdLinkCopied')) },
          SEP,
          {
            id: 'eyeDropper', icon: I.pipette, when: (c) => c.caps.eyeDropper,
            run: async (c, e) => {
              try {
                const res = await new g.EyeDropper().open();
                await e.copy(res.sRGBHex, e.t('colorCopied', { hex: res.sRGBHex }));
              } catch (err) {
                // Pressing Esc rejects with AbortError — that is a cancel, not a failure.
                if (!err || err.name !== 'AbortError') e.toast(e.t('colorPickFailed', { msg: err && err.message }), 'error');
              }
            }
          }
        ]
      },
      {
        id: 'page', group: 'tools', icon: I.layout,
        children: [
          { id: 'forceDark', icon: I.moon, when: (c) => !!c.pageHost, checked: (c) => c.darkSite, run: (c, e) => e.toggleDarkSite(c.pageHost) },
          {
            id: 'screenshot', icon: I.camera,
            run: async (c, e) => {
              await e.menuClosed();
              const r = await e.send({ type: 'SCREENSHOT' });
              if (!r.ok) { e.toast(e.t('screenshotFailed', { msg: r.error }), 'error', 5000); return; }
              await e.copyPng(U.dataUrlToBlob(r.result), 'screenshotCopied');
            }
          },
          {
            id: 'translatePage', icon: I.languages, when: (c) => U.isHttpUrl(c.pageUrl),
            run: (c, e) => e.open(`https://translate.google.com/translate?sl=auto&tl=${enc(e.targetLang())}&u=${enc(c.pageUrl)}`)
          },
          { id: 'pageQr', icon: I.qr, run: (c, e) => e.qr(c.pageUrl) },
          SEP,
          {
            id: 'pinTab', icon: I.pin,
            run: async (c, e) => { const r = await e.send({ type: 'TOGGLE_PIN' }); r.ok ? e.toast(e.t(r.result ? 'pinned' : 'unpinned'), 'success') : e.toast(e.t('tabActionFailed', { msg: r.error }), 'error'); }
          },
          {
            id: 'muteTab', icon: I.volumeX,
            run: async (c, e) => { const r = await e.send({ type: 'TOGGLE_MUTE' }); r.ok ? e.toast(e.t(r.result ? 'muted' : 'unmuted'), 'success') : e.toast(e.t('tabActionFailed', { msg: r.error }), 'error'); }
          },
          SEP,
          { id: 'disableSite', icon: I.ban, when: (c) => !!c.pageHost, run: (c, e) => e.disableSite(c.pageHost) }
        ]
      },
      {
        // Filled from the user's "open URL" custom actions; hidden while empty.
        id: 'custom', group: 'tools', icon: I.zap, children: [],
        extra: (c, e) => e.customItems('url').map((ci, i) => ({
          id: `custom-url-${i}`, raw: true, text: ci.label, icon: I.zap,
          run: (cc, ee) => ee.open(U.fillTemplate(ci.template, cc.selection || cc.link || cc.image || cc.pageUrl))
        }))
      },

      // ---------- Navigation ----------
      {
        id: 'back', group: 'nav', icon: I.back, shortcut: K.back,
        disabled: (c) => c.isTop && c.caps.nav && !c.caps.canGoBack,
        run: (c, e) => e.send({ type: 'NAV', dir: 'back' })
      },
      {
        id: 'forward', group: 'nav', icon: I.forward, shortcut: K.forward,
        disabled: (c) => c.isTop && c.caps.nav && !c.caps.canGoForward,
        run: (c, e) => e.send({ type: 'NAV', dir: 'forward' })
      },
      { id: 'reload', group: 'nav', icon: I.refresh, shortcut: K.reload, run: (c, e) => e.send({ type: 'NAV', dir: 'reload' }) },
      { id: 'print', group: 'nav', icon: I.print, shortcut: K.print, scope: 'top', run: () => g.print() }
    ];
  };
})(self);
