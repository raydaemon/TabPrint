import { cleanFolder, getDir, loadSettings, pdfOptions } from "./settings.js";

const safeName = (s) => (s || "untitled").replace(/[\\/:*?"<>|%]+/g, "_").trim().slice(0, 80);
let job = null; // { cmd, done, failed, total, stopped, finished }
let stopJob = null; // set while a job runs
let stopPage = null; // set while LOAD_SCRIPT runs in a tab

const showProgress = () => {
  chrome.action.setBadgeText({ text: job.finished && !job.total ? "" : `${job.done}/${job.total}` });
  chrome.runtime.sendMessage({ cmd: "progress", job }).catch(() => {}); // fails when no popup is open
};

async function withDebugger(tabId, fn) {
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try { return await fn((method, params) => chrome.debugger.sendCommand(target, method, params)); }
  finally { await chrome.debugger.detach(target).catch(() => {}); }
}

// Resolves when the tab finishes loading (or after 30s). Pass checkNow=false right before a reload.
const waitComplete = (tabId, checkNow = true) => new Promise((resolve) => {
  const onUpdated = (id, info) => { if (id === tabId && info.status === "complete") done(); };
  const done = () => { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(onUpdated); resolve(); };
  const timer = setTimeout(done, 30000);
  chrome.tabs.onUpdated.addListener(onUpdated);
  if (checkNow) chrome.tabs.get(tabId).then((t) => t.status === "complete" && done(), done);
});

async function refreshTab(tab) {
  const loaded = waitComplete(tab.id, false);
  await chrome.tabs.reload(tab.id);
  await loaded;
}

// Runs inside the page: scroll to the bottom until the height stops growing, force lazy images, wait for them.
const LOAD_SCRIPT = `(async () => {
  window.__tabprintStop = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const el = document.scrollingElement || document.documentElement;
  let lastHeight = -1, stable = 0;
  // ponytail: capped at 200 screens so infinite-scroll feeds terminate
  for (let i = 0; i < 200 && stable < 3 && !window.__tabprintStop; i++) {
    window.scrollBy(0, innerHeight * 0.9);
    await sleep(200);
    if (innerHeight + scrollY >= el.scrollHeight - 2) {
      stable = el.scrollHeight === lastHeight ? stable + 1 : 0;
      lastHeight = el.scrollHeight;
      await sleep(500);
    }
  }
  if (!window.__tabprintStop) {
  document.querySelectorAll('img[loading="lazy"]').forEach((img) => (img.loading = "eager"));
  await Promise.all([...document.images].filter((img) => !img.complete).map((img) =>
    new Promise((r) => { img.addEventListener("load", r); img.addEventListener("error", r); setTimeout(r, 5000); })));
  }
  scrollTo(0, 0);
  await sleep(300);
})()`;

async function loadTab(tab) {
  if (tab.discarded) await refreshTab(tab);
  // Background tabs don't render, so IntersectionObserver-based lazy loading never fires there.
  await chrome.tabs.update(tab.id, { active: true });
  await waitComplete(tab.id);
  if (job.stopped) return;
  await withDebugger(tab.id, async (send) => {
    stopPage = () => send("Runtime.evaluate", { expression: "window.__tabprintStop = true" });
    if (job.stopped) await stopPage();
    const { exceptionDetails } = await send("Runtime.evaluate", { expression: LOAD_SCRIPT, awaitPromise: true });
    stopPage = null;
    if (exceptionDetails) throw new Error(exceptionDetails.text);
  });
}

// "name.pdf", "name (1).pdf", ... : never overwrite a file already in the chosen folder
async function freeName(dir, name) {
  for (let i = 0; ; i++) {
    const candidate = i ? name.replace(/\.pdf$/, ` (${i}).pdf`) : name;
    try { await dir.getFileHandle(candidate); } catch (e) { if (e.name === "NotFoundError") return candidate; }
  }
}

async function printTab(tab, prefix, options, save) {
  const { data } = await withDebugger(tab.id, (send) => send("Page.printToPDF", options));
  const url = "data:application/pdf;base64," + data;
  const name = `${prefix}${safeName(tab.title)}.pdf`;
  if (save.mode === "custom") {
    const dir = await getDir();
    if (dir && (await dir.queryPermission({ mode: "readwrite" })) === "granted") {
      const writable = await (await dir.getFileHandle(await freeName(dir, name), { create: true })).createWritable();
      await writable.write(await (await fetch(url)).blob());
      await writable.close();
      return;
    }
    console.warn("TabPrint: no access to the chosen folder, saving to Downloads instead");
  }
  await chrome.downloads.download({
    url,
    filename: (save.folder ? save.folder + "/" : "") + name,
    saveAs: save.mode === "ask",
  });
}

async function makeAction(cmd, tabs) {
  if (cmd === "refresh") return refreshTab;
  if (cmd === "load") return loadTab;
  const settings = await loadSettings();
  const options = pdfOptions(settings);
  const save = { mode: settings.saveMode, folder: cleanFolder(settings.folder) };
  return (tab, i) => printTab(tab, tabs.length === 1 ? "" : `${String(i + 1).padStart(2, "0")} - `, options, save);
}

async function run(cmd, tabIds) {
  if (job && !job.finished) return;
  // Each run owns its job object, claimed before the first await. Steps still pending from an
  // earlier run (e.g. reloads of a stopped Refresh) only touch their own job, never this one.
  const current = (job = { cmd, done: 0, failed: 0, total: 0, stopped: false, finished: false });
  const report = () => { if (job === current) showProgress(); };
  try {
    const tabs = (await Promise.all(tabIds.map((id) => chrome.tabs.get(id).catch(() => null))))
      .filter((t) => t && /^https?:/.test(t.url));
    const [originalActive] = await chrome.tabs.query({ active: true, currentWindow: true });
    const action = await makeAction(cmd, tabs);
    current.total = tabs.length;
    let resolveStopped;
    const stopped = new Promise((r) => (resolveStopped = r));
    stopJob = () => { current.stopped = true; resolveStopped(); stopPage?.().catch(() => {}); report(); };
    const step = async (tab, i) => {
      try { await action(tab, i); current.done++; } catch (e) { current.failed++; console.warn(`TabPrint ${cmd}:`, tab.url, e.message); }
      if (!current.finished) report();
    };
    chrome.action.setBadgeBackgroundColor({ color: "#555" });
    report();
    // Stop on refresh just stops waiting: reloads already sent can't be recalled.
    if (cmd === "refresh") await Promise.race([Promise.all(tabs.map(step)), stopped]);
    // ponytail: sequential; parallelize printing if windows with 100+ tabs feel slow
    else for (const [i, tab] of tabs.entries()) { if (current.stopped) break; await step(tab, i); }
    if (cmd === "load" && originalActive) await chrome.tabs.update(originalActive.id, { active: true }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ color: current.stopped ? "#555" : current.failed || !tabs.length ? "#c62828" : "#2e7d32" });
    setTimeout(() => { if (job === current) chrome.action.setBadgeText({ text: "" }); }, 5000);
  } finally {
    stopJob = stopPage = null;
    current.finished = true;
    report();
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.cmd === "status") sendResponse(job);
  else if (msg.cmd === "stop") stopJob?.();
  else if (["print", "refresh", "load"].includes(msg.cmd)) run(msg.cmd, msg.tabIds);
});
