import { loadSettings, pdfOptions } from "./settings.js";

const safeName = (s) => (s || "untitled").replace(/[\\/:*?"<>|%]+/g, "_").trim().slice(0, 80);
let busy = false;

async function printTab(tab, prefix, options) {
  const target = { tabId: tab.id };
  await chrome.debugger.attach(target, "1.3");
  try {
    const { data } = await chrome.debugger.sendCommand(target, "Page.printToPDF", options);
    await chrome.downloads.download({
      url: "data:application/pdf;base64," + data,
      filename: `TabPrint/${prefix}${safeName(tab.title)}.pdf`,
    });
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

async function run(tabIds) {
  if (busy) return;
  busy = true;
  try {
    const tabs = (await Promise.all(tabIds.map((id) => chrome.tabs.get(id).catch(() => null))))
      .filter((t) => t && /^https?:/.test(t.url));
    const options = pdfOptions(await loadSettings());
    let done = 0, failed = 0;
    chrome.action.setBadgeBackgroundColor({ color: "#555" });
    chrome.action.setBadgeText({ text: `0/${tabs.length}` });
    // ponytail: sequential; parallelize if windows with 100+ tabs feel slow
    for (const [i, tab] of tabs.entries()) {
      const prefix = tabs.length === 1 ? "" : `${String(i + 1).padStart(2, "0")} - `;
      try { await printTab(tab, prefix, options); done++; } catch (e) { failed++; console.warn("TabPrint:", tab.url, e.message); }
      chrome.action.setBadgeText({ text: `${done}/${tabs.length}` });
    }
    chrome.action.setBadgeBackgroundColor({ color: failed || !tabs.length ? "#c62828" : "#2e7d32" });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 5000);
  } finally {
    busy = false;
  }
}

chrome.runtime.onMessage.addListener((msg) => { if (msg.cmd === "print") run(msg.tabIds); });
