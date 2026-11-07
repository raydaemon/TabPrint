// Run: node tests/badge.test.mjs
// Regression: tabs still reloading after a stopped Refresh must not count toward the next job.
const listeners = [], updated = [], badges = [];
const tabs = Array.from({ length: 13 }, (_, i) => ({ id: i + 1, url: `https://e.com/${i}`, title: `t${i}`, status: "complete" }));
globalThis.chrome = {
  runtime: { onMessage: { addListener: (f) => listeners.push(f) }, sendMessage: async () => {} },
  tabs: {
    get: async (id) => tabs[id - 1], query: async () => [tabs[0]], reload: async () => {}, update: async () => {},
    onUpdated: { addListener: (f) => updated.push(f), removeListener: (f) => updated.splice(updated.indexOf(f), 1) },
  },
  action: { setBadgeText: ({ text }) => badges.push(text), setBadgeBackgroundColor() {} },
  storage: { sync: { get: async (d) => d } },
  debugger: { attach: async () => {}, detach: async () => {}, sendCommand: () => new Promise((r) => setTimeout(() => r({ data: "AA==" }), 30)) },
  downloads: { download: async () => 1 },
};
await import(new URL("../background.js", import.meta.url));
const send = (msg) => listeners[0](msg, {}, () => {});
const tick = () => new Promise((r) => setTimeout(r, 20));
const ids = tabs.map((t) => t.id);

send({ cmd: "refresh", tabIds: ids }); await tick();
send({ cmd: "stop" }); await tick();
send({ cmd: "print", tabIds: ids }); await tick(); await tick(); // print is mid-way
// the stopped Refresh's reloads finish now
for (const t of tabs) [...updated].forEach((f) => f(t.id, { status: "complete" }));
await new Promise((r) => setTimeout(r, 600)); // let print finish

const over = badges.filter((b) => b && Number(b.split("/")[0]) > Number(b.split("/")[1]));
if (over.length) throw new Error("badge overcounted: " + over.join(", "));
if (badges.at(-1) !== "13/13") throw new Error("last badge " + badges.at(-1));
console.log("badge ok:", badges.slice(-3).join(" "));
process.exit(0);
