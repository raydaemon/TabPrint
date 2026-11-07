import { DEFAULTS, cleanFolder, loadSettings } from "./settings.js";

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
const syncSave = () => {
  const ask = $("saveAs").value === "true";
  $("folder").disabled = ask;
  const folder = cleanFolder($("folder").value);
  $("saveHint").textContent = ask
    ? "Chrome asks for a location for each tab."
    : `Saves to Downloads${folder ? "/" + folder : ""}`;
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
    saveAs: $("saveAs").value === "true",
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
const tabs = await chrome.tabs.query({ currentWindow: true });
for (const t of tabs) {
  const li = document.createElement("li");
  li.className = (printable(t) ? "" : "off ") + (t.active ? "active" : "");
  li.title = printable(t) ? t.url : "Chrome can't print this page";
  const label = document.createElement("label");
  const box = Object.assign(document.createElement("input"), { type: "checkbox", value: t.id, checked: printable(t), disabled: !printable(t) });
  const icon = Object.assign(document.createElement("img"), { src: t.favIconUrl || "icons/16.png", alt: "" });
  icon.onerror = () => { icon.src = "icons/16.png"; };
  const title = Object.assign(document.createElement("span"), { textContent: t.title || t.url });
  label.append(box, icon, title);
  li.append(label);
  list.append(li);
}

const boxes = [...list.querySelectorAll("input:not(:disabled)")];
const update = () => {
  const n = boxes.filter((b) => b.checked).length;
  $("count").textContent = `${n} of ${boxes.length}`;
  for (const id of ["print", "refresh", "load"]) $(id).disabled = !n;
  $("print").textContent = n ? `Print ${n}` : "Print";
};
list.addEventListener("change", update);
$("all").addEventListener("click", () => { boxes.forEach((b) => (b.checked = true)); update(); });
$("none").addEventListener("click", () => { boxes.forEach((b) => (b.checked = false)); update(); });
for (const cmd of ["print", "refresh", "load"]) {
  $(cmd).addEventListener("click", async () => {
    const tabIds = boxes.filter((b) => b.checked).map((b) => Number(b.value));
    await chrome.runtime.sendMessage({ cmd, tabIds }).catch(() => {});
    window.close();
  });
}
update();
