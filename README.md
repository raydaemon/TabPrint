# TabPrint

Chrome extension that prints every tab in the current window to PDF with one click.

## Install

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this folder.

## Use

Click the TabPrint toolbar icon. Each `http(s)` tab in the current window is saved to
`Downloads/TabPrint/NN - <tab title>.pdf`. The badge shows progress; green means all
succeeded, red means some tabs failed (details in the service worker console).

Chrome shows a "TabPrint started debugging this browser" bar while printing. That is
expected: the extension uses the `chrome.debugger` API and DevTools `Page.printToPDF`
so no per-tab Save dialog is needed.

## Limitations

- Discarded (sleeping) tabs may print blank. Reload them first.
- `chrome://`, Web Store and other restricted pages are skipped.
- Paper size and options are fixed to Chrome defaults with backgrounds on.
