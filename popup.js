import { DEFAULTS, cleanFolder, getDir, loadSettings } from "./settings.js";

const $ = (id) => document.getElementById(id);
const form = $("settings");
const printable = (t) => /^https?:/.test(t.url ?? "");

// settings
const s = await loadSettings();
for (const key of Object.keys(DEFAULTS)) {
  const el = $(key);
  if (el.type === "checkbox") el.checked = s[key];
  else el.value = String(s[key]);
}
const dir = await getDir().catch(() => null);
$("dirName").textContent = dir ? dir.name : "None chosen";
$("chooseDir").addEventListener("click", () => chrome.tabs.create({ url: "folder.html" }));
const syncSave = () => {
  const mode = $("saveMode").value;
  $("rowSub").hidden = mode !== "downloads";
  $("rowDir").hidden = mode !== "custom";
  const folder = cleanFolder($("folder").value);
  $("saveHint").textContent = {
    downloads: `Saves to Downloads${folder ? "/" + folder : ""}`,
    custom: dir ? "Files with the same name get a number added." : "Choose a folder to save into.",
    ask: "Chrome asks for a location for each tab.",
  }[mode];
};
syncSave();
form.addEventListener("input", syncSave);
form.addEventListener("change", () => {
  syncSave();
  const scale = Math.min(200, Math.max(10, Number($("scale").value) || 100));
  $("scale").value = scale;
  chrome.storage.sync.set({
    paper: $("paper").value,
    landscape: $("landscape").value === "true",
    margins: $("margins").value,
    scale,
    pages: $("pages").value,
    background: $("background").checked,
    headerFooter: $("headerFooter").checked,
    saveMode: $("saveMode").value,
    folder: cleanFolder($("folder").value),
  });
});
form.addEventListener("submit", (e) => e.preventDefault());
$("gear").addEventListener("click", () => {
  form.hidden = !form.hidden;
  $("gear").setAttribute("aria-expanded", String(!form.hidden));
});

// tab list
const list = $("tabs");
const ACTIONS = ["print", "refresh", "load"];
const VERB = { print: "Printing", refresh: "Refreshing", load: "Loading" };
let boxes = [];
let job = null;
const running = () => job && !job.finished;

async function renderTabs(checkedIds) {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  list.replaceChildren(...tabs.map((t) => {
    const li = document.createElement("li");
    li.className = (printable(t) ? "" : "off ") + (t.active ? "active" : "");
    li.title = printable(t) ? t.url : "Chrome can't print this page";
    const label = document.createElement("label");
    const checked = printable(t) && (!checkedIds || checkedIds.has(t.id));
    const box = Object.assign(document.createElement("input"), { type: "checkbox", value: t.id, checked, disabled: !printable(t) });
    const icon = Object.assign(document.createElement("img"), { src: t.favIconUrl || "icons/16.png", alt: "" });
    icon.onerror = () => { icon.src = "icons/16.png"; };
    const title = Object.assign(document.createElement("span"), { textContent: t.title || t.url });
    label.append(box, icon, title);
    li.append(label);
    return li;
  }));
  boxes = [...list.querySelectorAll("input:not(:disabled)")];
  update();
}

const selectedIds = () => boxes.filter((b) => b.checked).map((b) => Number(b.value));

function update() {
  const n = selectedIds().length;
  $("count").textContent = running() ? `${VERB[job.cmd]} ${job.done + job.failed}/${job.total}` : `${n} of ${boxes.length}`;
  for (const id of ACTIONS) {
    const stoppable = running() && job.cmd === id && id !== "print";
    const label = { print: "Print", refresh: "Refresh", load: "Load" }[id];
    $(id).textContent = stoppable ? (job.stopped ? "Stopping…" : "Stop") : label;
    $(id).classList.toggle("stop", stoppable);
    $(id).disabled = stoppable ? job.stopped : !n || running();
  }
}

list.addEventListener("change", update);
$("all").addEventListener("click", () => { boxes.forEach((b) => (b.checked = true)); update(); });
$("none").addEventListener("click", () => { boxes.forEach((b) => (b.checked = false)); update(); });

for (const cmd of ACTIONS) {
  $(cmd).addEventListener("click", async () => {
    if (running() && job.cmd === cmd) {
      job.stopped = true;
      update();
      chrome.runtime.sendMessage({ cmd: "stop" }).catch(() => {});
      return;
    }
    // Folder access can lapse (e.g. after a browser restart). Re-ask now, while we have a click.
    if (cmd === "print" && $("saveMode").value === "custom") {
      const granted = dir && (await dir.requestPermission({ mode: "readwrite" }).catch(() => "denied")) === "granted";
      if (!granted) return chrome.tabs.create({ url: "folder.html" });
    }
    const tabIds = selectedIds();
    job = { cmd, done: 0, failed: 0, total: tabIds.length, stopped: false, finished: false };
    update();
    await chrome.runtime.sendMessage({ cmd, tabIds }).catch(() => {});
    // Print may open Save As dialogs, so get out of the way. Refresh/Load keep the popup open
    // (Chrome itself closes it when Load switches tabs; reopening shows live progress).
    if (cmd === "print") window.close();
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.cmd !== "progress") return;
  const wasRunning = running();
  job = msg.job;
  if (wasRunning && job.finished) renderTabs(new Set(selectedIds())); // titles/favicons may have changed
  else update();
});

job = await chrome.runtime.sendMessage({ cmd: "status" }).catch(() => null);
await renderTabs();
