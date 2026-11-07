# TabPrint

<img src="icons/128.png" width="64" align="right" alt="">

Chrome extension that prints the tabs you pick to PDF in one click.

## Install

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this folder.

## Use

Click the TabPrint toolbar icon. A popup lists every tab in the current window.

- Tick the tabs you want, or use **All** / **None**.
- Click **Print**. By default each tab is saved to `Downloads/TabPrint/NN - <tab title>.pdf`
  (a single tab is saved without the number prefix).
- **Refresh** reloads the selected tabs, which also wakes discarded (sleeping) tabs.
- **Load** visits each selected tab, scrolls to the bottom until the page stops
  growing, waits for images, then scrolls back to the top. Use it before printing
  pages with lazy-loaded content. Infinite-scroll feeds stop after 200 screens.
- The badge shows progress. Green means all succeeded, red means some failed
  (details in the service worker console).

Click **⚙** for print settings, like Chrome's print dialog: paper size
(Letter, Legal, Tabloid, A3, A4, A5), portrait or landscape, margins, scale, page
ranges, background graphics, and headers and footers. Settings are saved and synced.

**Save to** picks where PDFs go:

- **Downloads folder** saves straight into a subfolder of Downloads (default
  `TabPrint`, leave blank for the Downloads root). Chrome extensions can't write
  outside the Downloads folder.
- **Ask every time** opens Chrome's Save As dialog for each tab.

If Chrome's own "Ask where to save each file" setting is on, Chrome asks regardless.

Chrome shows a "TabPrint started debugging this browser" bar while printing. That is
expected: the extension uses the `chrome.debugger` API and DevTools `Page.printToPDF`
so no per-tab Save dialog is needed.

## Limitations

- Discarded (sleeping) tabs may print blank. Use **Refresh** or **Load** first.
- `chrome://`, Web Store and other restricted pages are greyed out and can't be printed.
- A page range larger than a tab's page count makes that tab fail.

## Versioning

Versions follow `6.<month>.<DDNN>` (day + build number). Chrome forbids leading zeros
in `version`, so `0701` is stored as `version: 6.11.701` with
`version_name: 6.11.0701` for display.
