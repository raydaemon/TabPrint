const safeName = (s) => (s || "untitled").replace(/[\\/:*?"<>|%]+/g, "_").trim().slice(0, 80);

async function printTab(tab, index) {
  const target = { tabId: tab.id };
  await chrome.debugger.attach(target, "1.3");
  try {
    const { data } = await chrome.debugger.sendCommand(target, "Page.printToPDF", { printBackground: true });
    await chrome.downloads.download({
      url: "data:application/pdf;base64," + data,
      filename: `TabPrint/${String(index + 1).padStart(2, "0")} - ${safeName(tab.title)}.pdf`,
    });
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

chrome.action.onClicked.addListener(async () => {
  const tabs = (await chrome.tabs.query({ currentWindow: true })).filter((t) => /^https?:/.test(t.url));
  let done = 0, failed = 0;
  // ponytail: sequential; parallelize if windows with 100+ tabs feel slow
  for (const [i, tab] of tabs.entries()) {
    try { await printTab(tab, i); done++; } catch (e) { failed++; console.warn("TabPrint:", tab.url, e.message); }
    chrome.action.setBadgeText({ text: `${done}/${tabs.length}` });
  }
  chrome.action.setBadgeBackgroundColor({ color: failed ? "#c62828" : "#2e7d32" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 5000);
});
