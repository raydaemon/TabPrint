export const DEFAULTS = {
  paper: "Letter", landscape: false, margins: "default", scale: 100,
  pages: "", background: true, headerFooter: false,
  saveMode: "downloads", // "downloads" | "custom" | "ask"
  folder: "TabPrint",
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

// The chosen save folder is a FileSystemDirectoryHandle. Handles can't go in chrome.storage,
// so it lives in IndexedDB (local to this browser).
const idb = (mode, fn) => new Promise((resolve, reject) => {
  const open = indexedDB.open("tabprint", 1);
  open.onupgradeneeded = () => open.result.createObjectStore("kv");
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const req = fn(open.result.transaction("kv", mode).objectStore("kv"));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  };
});
export const getDir = () => idb("readonly", (s) => s.get("dir"));
export const setDir = (handle) => idb("readwrite", (s) => s.put(handle, "dir"));

// "name.pdf", "name (1).pdf", ... : never overwrite a file already in the chosen folder
export async function freeName(dir, name) {
  for (let i = 0; ; i++) {
    const candidate = i ? name.replace(/\.pdf$/, ` (${i}).pdf`) : name;
    try { await dir.getFileHandle(candidate); } catch (e) { if (e.name === "NotFoundError") return candidate; }
  }
}

export async function writeToDir(dir, name, url) {
  const writable = await (await dir.getFileHandle(await freeName(dir, name), { create: true })).createWritable();
  await writable.write(await (await fetch(url)).blob());
  await writable.close();
}
