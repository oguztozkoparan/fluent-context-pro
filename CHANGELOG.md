# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Write new entries under **Unreleased**;
`npm run release -- <patch|minor|major>` moves them under the new version.

## [Unreleased]

### Added
- "Open and Switch to Tab" link action: opens the link in a new tab and switches to it.
- MIT license.
- Appearance → Highlight: "Colorless" (default, a neutral fill on every platform style) or
  "Accent color".

### Changed
- "Open in New Tab" opens the tab in the background, like the browser's own menu.
  "Open in Background Tab" is removed; pins and custom order move to "Open in New Tab".
- The compact layout keeps frequent actions on the main menu: "Open in Private Window",
  "Copy Image Address", "Open Image in New Tab" and "Loop" are no longer under "More".
- The hovered row no longer shows a blue indicator bar (Windows). By default it uses a neutral
  fill on every style, including macOS. With Highlight set to "Accent color", Windows and Linux
  tint the row and its text with the accent color, with text contrast adjusted automatically,
  and macOS keeps its full accent highlight.
- Menu rows and icon buttons show a pointer cursor.

### Fixed
- The toolbar popup could open very narrow: it no longer caps its width to the initial popup
  viewport. It is now 560×600 instead of 400×580.
- The live preview in settings scrolls when the menu is taller than the preview area.

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
