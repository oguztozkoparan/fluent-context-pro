# Security Policy

## Supported versions

Only the latest release receives fixes. Store installs update automatically.

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Use GitHub's
"Report a vulnerability" button (Security → Advisories) in this repository, or contact the
maintainer privately. Include steps to reproduce and the browser/OS version. You can expect a
first response within a week.

## Security model

- **Untrusted input:** every web page is untrusted. The content script only reacts to trusted
  (user-generated) `contextmenu`, keyboard and pointer events, so pages cannot open the menu or
  trigger its actions. The UI lives in a closed shadow root in the browser's top layer.
- **Background validation:** URLs opened, downloaded or fetched by the background are restricted to
  http(s) (and media-only `data:` downloads); background fetches never send cookies and only return
  media. Frame relays go through `runtime` messaging, which pages cannot access.
- **Secrets:** API keys stay in `storage.local`, are never synced or exported, and are refused on
  plain-HTTP connections to non-local hosts.
- **No dynamic code:** no `eval`, `new Function`, remote scripts or `innerHTML`; a strict extension-page
  CSP. `scripts/check.mjs` enforces these rules in CI, and CodeQL runs on every push.
- **Least privilege:** the permission list is pinned in `scripts/check.mjs`; changing it fails CI until
  the store justifications in `docs/STORE.md` are reviewed.
