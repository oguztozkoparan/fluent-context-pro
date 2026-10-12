# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Write new entries under **Unreleased**;
`npm run release -- <patch|minor|major>` moves them under the new version.

## [Unreleased]

## [6.1.0] - 2026-09-24

### Added
- Compact menu layout (default): less-used actions of each category move into a
  "More …" submenu, so a link menu shows 5 rows instead of 16.
- Navigation (Back, Forward, Reload, Print) as a single row of icon buttons.
- Update handling: store updates are applied immediately, a "what's new" banner and
  badge appear after an update, and non-store installs check GitHub Releases.
- Settings: category-grouped item list with a filter box, layout options,
  an Updates card, version in the header, fixed 400×580 popup with a sticky preview.
- Onboarding: the settings page opens after the first install.
- Tooling: dependency-free build, ZIP packaging, static checks, unit and headless
  Chrome end-to-end tests, GitHub Actions for CI, releases and store publishing.

### Security
- The menu ignores synthetic (script-generated) `contextmenu`, key and pointer events,
  so web pages cannot open it or trigger its actions.
- The background validates every URL it opens, downloads or fetches (http/https only,
  media-only `data:` downloads, media-only responses, cookies never sent).
- API keys are never sent over plain HTTP to non-local hosts.
- Clipboard fallback runs inside the closed shadow root, so pages cannot observe copied text.
- No `innerHTML` anywhere: UI is built with DOM APIs; strict extension-page CSP.

## [6.0.0] - 2026-09-15

### Added
- Rebuilt as a modular cross-browser extension (Chrome, Edge, Opera, Firefox) with
  Windows (Fluent), macOS and Linux (GNOME) looks and OS-aware shortcut labels.
- Six interface languages with automatic system-language detection.
- Menus for small iframes are drawn by the top page; offline QR codes; LLM streaming;
  custom URL and AI actions; per-site dark mode; settings sync, export and import.
