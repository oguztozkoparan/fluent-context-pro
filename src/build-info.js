// FluentContext Pro — build metadata. scripts/build.mjs rewrites this file inside dist/ packages.
//   repo    "owner/name" on GitHub; enables release checks for installs that are not from a store
//   target  chromium | firefox | firefox-selfhosted | dev
(function (g) {
  'use strict';
  const FC = (g.FC = g.FC || {});
  FC.build = FC.build || { repo: '', target: 'dev' };
})(self);
