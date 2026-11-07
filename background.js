import { cleanFolder, loadSettings, pdfOptions } from "./settings.js";

const safeName = (s) => (s || "untitled").replace(/[\\/:*?"<>|%]+/g, "_").trim().slice(0, 80);
let job = null; // { cmd, done, failed, total, finished }

const report = () => {
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
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const el = document.scrollingElement || document.documentElement;
  let lastHeight = -1, stable = 0;
  // ponytail: capped at 200 screens so infinite-scroll feeds terminate
  for (let i = 0; i < 200 && stable < 3; i++) {
    window.scrollBy(0, innerHeight * 0.9);
    await sleep(200);
    if (innerHeight + scrollY >= el.scrollHeight - 2) {
      stable = el.scrollHeight === lastHeight ? stable + 1 : 0;
      lastHeight = el.scrollHeight;
      await sleep(500);
    }
  }
  document.querySelectorAll('img[loading="lazy"]').forEach((img) => (img.loading = "eager"));
  await Promise.all([...document.images].filter((img) => !img.complete).map((img) =>
    new Promise((r) => { img.addEventListener("load", r); img.addEventListener("error", r); setTimeout(r, 5000); })));
  scrollTo(0, 0);
  await sleep(300);
})()`;

async function loadTab(tab) {
  if (tab.discarded) await refreshTab(tab);
  // Background tabs don't render, so IntersectionObserver-based lazy loading never fires there.
  await chrome.tabs.update(tab.id, { active: true });
  await waitComplete(tab.id);
  await withDebugger(tab.id, async (send) => {
    const { exceptionDetails } = await send("Runtime.evaluate", { expression: LOAD_SCRIPT, awaitPromise: true });
    if (exceptionDetails) throw new Error(exceptionDetails.text);
  });
}

async function printTab(tab, prefix, options, save) {
  const { data } = await withDebugger(tab.id, (send) => send("Page.printToPDF", options));
  await chrome.downloads.download({
    url: "data:application/pdf;base64," + data,
    filename: (save.folder ? save.folder + "/" : "") + `${prefix}${safeName(tab.title)}.pdf`,
    saveAs: save.saveAs,
  });
}

async function makeAction(cmd, tabs) {
  if (cmd === "refresh") return refreshTab;
  if (cmd === "load") return loadTab;
  const settings = await loadSettings();
  const options = pdfOptions(settings);
  const save = { saveAs: settings.saveAs, folder: cleanFolder(settings.folder) };
  return (tab, i) => printTab(tab, tabs.length === 1 ? "" : `${String(i + 1).padStart(2, "0")} - `, options, save);
}

async function run(cmd, tabIds) {
  if (job && !job.finished) return;
  try {
    const tabs = (await Promise.all(tabIds.map((id) => chrome.tabs.get(id).catch(() => null))))
      .filter((t) => t && /^https?:/.test(t.url));
    const [originalActive] = await chrome.tabs.query({ active: true, currentWindow: true });
    const action = await makeAction(cmd, tabs);
    job = { cmd, done: 0, failed: 0, total: tabs.length, finished: false };
    const step = async (tab, i) => {
      try { await action(tab, i); job.done++; } catch (e) { job.failed++; console.warn(`TabPrint ${cmd}:`, tab.url, e.message); }
      report();
    };
    chrome.action.setBadgeBackgroundColor({ color: "#555" });
    report();
    if (cmd === "refresh") await Promise.all(tabs.map(step));
    // ponytail: sequential; parallelize printing if windows with 100+ tabs feel slow
    else for (const [i, tab] of tabs.entries()) await step(tab, i);
    if (cmd === "load" && originalActive) await chrome.tabs.update(originalActive.id, { active: true }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ color: job.failed || !tabs.length ? "#c62828" : "#2e7d32" });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 5000);
  } finally {
    job = { ...(job ?? { cmd, done: 0, failed: 0, total: 0 }), finished: true };
    report();
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.cmd === "status") sendResponse(job);
  else if (["print", "refresh", "load"].includes(msg.cmd)) run(msg.cmd, msg.tabIds);
});
