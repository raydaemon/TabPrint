import { getDir, setDir } from "./settings.js";

const $ = (id) => document.getElementById(id);
let dir = await getDir().catch(() => null);

async function show(message = "") {
  $("current").textContent = dir ? dir.name : "None";
  $("grant").hidden = !dir || (await dir.queryPermission({ mode: "readwrite" })) === "granted";
  $("msg").textContent = message;
}

const done = (verb) => show(`${verb} "${dir.name}". You can close this tab and print again.`);

$("pick").addEventListener("click", async () => {
  try {
    dir = await window.showDirectoryPicker({ id: "tabprint", mode: "readwrite" });
  } catch (e) {
    if (e.name !== "AbortError") show(e.message); // AbortError = user cancelled
    return;
  }
  await setDir(dir);
  await chrome.storage.sync.set({ saveMode: "custom" });
  done("Saving to");
});

$("grant").addEventListener("click", async () => {
  if ((await dir.requestPermission({ mode: "readwrite" })) === "granted") done("Access granted to");
  else show("Access was not granted.");
});

show();
