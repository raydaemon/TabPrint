export const DEFAULTS = {
  paper: "Letter", landscape: false, margins: "default", scale: 100,
  pages: "", background: true, headerFooter: false,
  saveAs: false, folder: "TabPrint",
};

// inches, matching Chrome's print dialog
const PAPER = { Letter: [8.5, 11], Legal: [8.5, 14], Tabloid: [11, 17], A3: [11.69, 16.54], A4: [8.27, 11.69], A5: [5.83, 8.27] };
const MARGIN = { default: 0.4, minimum: 0.2, none: 0 };

export const loadSettings = async () => ({ ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) });

// "a/../b\\c:" -> "a/b/c_"; downloads API only accepts paths inside the Downloads folder
export const cleanFolder = (f) =>
  String(f).split(/[\\/]+/).map((seg) => seg.replace(/[:*?"<>|%]+/g, "_").replace(/^\.+/, "").trim()).filter(Boolean).join("/");

export function pdfOptions(s) {
  const [paperWidth, paperHeight] = PAPER[s.paper] ?? PAPER.Letter;
  const m = MARGIN[s.margins] ?? MARGIN.default;
  return {
    paperWidth, paperHeight, landscape: s.landscape,
    marginTop: m, marginBottom: m, marginLeft: m, marginRight: m,
    scale: Math.min(2, Math.max(0.1, s.scale / 100)),
    pageRanges: s.pages.trim(),
    printBackground: s.background,
    displayHeaderFooter: s.headerFooter,
  };
}
