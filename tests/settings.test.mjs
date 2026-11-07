// Run: node tests/settings.test.mjs
const { cleanFolder, freeName } = await import(new URL("../settings.js", import.meta.url));
const eq = (a, b) => { if (a !== b) throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

eq(cleanFolder("TabPrint"), "TabPrint");
eq(cleanFolder("a/../b\\c:"), "a/b/c_");
eq(cleanFolder("/abs/path/"), "abs/path");
eq(cleanFolder("  "), "");

const dir = (names) => ({ getFileHandle: async (n) => { if (names.includes(n)) return {}; throw Object.assign(new Error(), { name: "NotFoundError" }); } });
eq(await freeName(dir([]), "a.pdf"), "a.pdf");
eq(await freeName(dir(["a.pdf"]), "a.pdf"), "a (1).pdf");
eq(await freeName(dir(["a.pdf", "a (1).pdf"]), "a.pdf"), "a (2).pdf");
console.log("settings ok");
