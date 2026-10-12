// FluentContext Pro — update handling (background only).
//
// Store installs (Chrome Web Store, Edge Add-ons, Firefox AMO) are updated by the browser; we only
// apply those updates promptly and show "what's new". Other installs (unpacked, self-hosted) check
// the GitHub Releases of FC.build.repo twice a day and show a badge + banner when a newer version exists.
(function (g) {
  'use strict';
  const FC = g.FC;
  if (FC.updates) return;
  const api = FC.api;
  const U = FC.util;
  const ALARM = 'fc-update-check';
  const PERIOD_MIN = 12 * 60;
  const local = api.storage.local;
  const current = () => api.runtime.getManifest().version;

  // 'github' | 'store' | 'none'
  async function channel() {
    if (!FC.build || !/^[\w.-]+\/[\w.-]+$/.test(FC.build.repo || '')) return 'none';
    try {
      const self = api.management && api.management.getSelf ? await api.management.getSelf() : null;
      if (self && self.installType === 'normal' && FC.build.target !== 'firefox-selfhosted') return 'store';
    } catch (e) { /* not available */ }
    return 'github';
  }

  async function autoEnabled() {
    try { return (await FC.config.load()).autoUpdateCheck !== false; } catch (e) { return true; }
  }

  async function schedule() {
    if (!api.alarms) return;
    const on = (await channel()) === 'github' && (await autoEnabled());
    const existing = await api.alarms.get(ALARM);
    if (on && !existing) api.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: PERIOD_MIN });
    if (!on && existing) await api.alarms.clear(ALARM);
  }

  async function badge() {
    const { updateInfo, whatsNew } = await local.get(['updateInfo', 'whatsNew']);
    let text = '';
    if (updateInfo && U.compareVersions(updateInfo.latest || '0', current()) > 0) text = '↑';
    else if (whatsNew) text = 'NEW';
    await api.action.setBadgeText({ text });
    if (text) await api.action.setBadgeBackgroundColor({ color: '#0078d4' });
  }

  async function check() {
    const ch = await channel();
    const base = { current: current(), channel: ch, checkedAt: Date.now() };
    if (ch !== 'github') return { ...base, status: ch };
    const repo = FC.build.repo;
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit', cache: 'no-store'
    });
    if (res.status === 404) return { ...base, status: 'unpublished' };
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
    const rel = await res.json();
    const latest = String(rel.tag_name || '').replace(/^v/i, '');
    if (!/^\d+(\.\d+){0,3}$/.test(latest)) throw new Error('Unexpected release tag');
    const url = /^https:\/\/github\.com\//.test(rel.html_url || '') ? rel.html_url : `https://github.com/${repo}/releases`;
    const info = { ...base, status: U.compareVersions(latest, base.current) > 0 ? 'available' : 'current', latest, url };
    await local.set({ updateInfo: info });
    await badge();
    return info;
  }

  async function status() {
    const { updateInfo, whatsNew } = await local.get(['updateInfo', 'whatsNew']);
    let info = updateInfo || null;
    if (info && U.compareVersions(info.latest || '0', current()) <= 0) info = { ...info, status: 'current' };
    const repo = (FC.build && FC.build.repo) || '';
    return {
      current: current(),
      channel: await channel(),
      info,
      whatsNew: whatsNew || null,
      releasesUrl: repo ? `https://github.com/${repo}/releases` : ''
    };
  }

  async function seen() {
    await local.remove('whatsNew');
    await badge();
    return true;
  }

  async function onInstalled(details) {
    if (details.reason === 'update' && details.previousVersion && details.previousVersion !== current()) {
      await local.set({ whatsNew: { version: current(), previous: details.previousVersion } });
    }
    if (details.reason === 'install') {
      try { await api.runtime.openOptionsPage(); } catch (e) { /* e.g. mobile */ }
    }
    await badge();
    await schedule();
  }

  function listen() {
    if (api.alarms) api.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) check().catch((e) => console.warn('[FluentContext] update check', e.message)); });
    // A store update is waiting: apply it now instead of on the next browser restart.
    if (api.runtime.onUpdateAvailable) api.runtime.onUpdateAvailable.addListener(() => api.runtime.reload());
    api.storage.onChanged.addListener((changes) => { if ('autoUpdateCheck' in changes) schedule(); });
  }

  FC.updates = { channel, schedule, check, status, seen, onInstalled, listen, badge };
})(self);
