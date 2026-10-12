# Privacy Policy — FluentContext Pro

_Last updated: 2026-09-24_

FluentContext Pro is a browser extension that replaces the right-click menu. This policy explains what
happens to your data. In short: **we do not collect, store, sell or share any data about you.**

## What the extension stores

- **Your settings** (appearance, menu layout, custom actions, site lists) are stored by your browser. If you
  use browser sync, your browser syncs them to your own account. The developer never receives them.
- **API keys** you enter for OCR or an AI service are stored only on your device and are never synced or exported.
- **Update status** (the latest version number seen) is stored on your device.

## When data leaves your browser

Nothing is sent anywhere until you choose a menu action that needs an external service. Then only the data
that action needs is sent, directly from your browser to the service you chose:

| Action | Data sent | Recipient |
|---|---|---|
| Search the Web, Translate, Search by Image, Wikipedia, Wayback Machine | The selected text, link or image address | The website you chose, opened in a new tab |
| Extract Text (OCR) | The image, or its address | OCR.Space, using your own API key |
| AI actions (summarize, explain, translate, custom prompts) | The selected text and your prompt | The AI endpoint you configured (by default your own computer) |
| Update check (only for installs that did not come from a browser store) | No personal data; a request for the latest release | api.github.com |

Those services have their own privacy policies. The developer has no access to what you send them.

## What we do not do

- No analytics, telemetry, advertising or tracking.
- No remote code: everything the extension runs ships inside the package.
- No selling or transferring of user data, and no use of data for purposes unrelated to the menu.

## Permissions

The extension asks for access to all websites because its menu has to work on every page. It uses that
access only to show the menu and to perform the action you click. See the store listing for the full list of
permissions and why each is needed.

## Contact

Questions or concerns: open an issue in the project's GitHub repository.
