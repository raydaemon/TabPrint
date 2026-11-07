# TabPrint

Manifest V3 Chrome extension: a toolbar popup lists the current window's tabs, and the
user picks tabs to Refresh, Load (scroll to bottom for lazy content), or Print to PDF.

## Layout

No build step, no dependencies. Plain ES modules loaded directly by Chrome.

- `manifest.json`: permissions are `tabs`, `debugger`, `downloads`, `storage`. Don't add
  `scripting` or host permissions; page work goes through the debugger instead.
- `background.js`: module service worker. Receives `{ cmd: "print" | "refresh" | "load", tabIds }`
  from the popup and runs one job at a time (`busy` flag). Progress shows on the action badge.
  - Print uses DevTools `Page.printToPDF` via `chrome.debugger`, then `chrome.downloads`.
  - Load activates each tab (background tabs don't render, so lazy loading never fires),
    runs `LOAD_SCRIPT` via `Runtime.evaluate`, then restores the original active tab.
- `settings.js`: shared by popup and worker. `DEFAULTS` is the single source of settings keys,
  stored in `chrome.storage.sync`. `pdfOptions()` maps settings to `printToPDF` params.
  `cleanFolder()` keeps download paths inside the Downloads folder.
- `popup.html` / `popup.js`: fixed 340x480 popup. The settings form overlays the tab list
  so opening it never resizes the popup or moves the gear button. Keep it that way.
- `icons/`: `icon.svg` for 32/48/128, `icon-small.svg` for 16. Regenerate PNGs with:

```sh
rsvg-convert -w 16 -h 16 icons/icon-small.svg -o icons/16.png
for n in 32 48 128; do rsvg-convert -w $n -h $n icons/icon.svg -o icons/$n.png; done
```

## Adding a setting

Add the key to `DEFAULTS`, a control with the same `id` in the popup form, the key to the
`chrome.storage.sync.set` call in `popup.js`, and use it in `pdfOptions()` or `background.js`.

## Versioning

Bump the version in `manifest.json` with every code change.

- Format: `6.<month>.<DDNN>`, where `DD` is the day and `NN` the build number that day,
  starting at `01`. Example: the second build on Nov 7 is `6.11.0702`.
- Chrome forbids leading zeros in `version`, so strip them there and keep the padded form in
  `version_name`: `"version": "6.11.702"`, `"version_name": "6.11.0702"`.

## Testing

There are no automated tests. After a change:

1. `node --check --input-type=module < file.js` for each changed JS file.
2. Reload the unpacked extension at `chrome://extensions` and try it on real tabs.
3. For popup layout, open `popup.html` in headless Chrome with a stub `window.chrome`
   (`storage.sync.get/set`, `tabs.query`, `runtime.sendMessage`) and take screenshots.

## Git

- Commit by feature: one commit per user-visible change, even if made together.
- Commit messages in English, imperative mood, short subject line.
- Remote: `git@github-raymond:raydaemon/TabPrint.git`, branch `main`.
