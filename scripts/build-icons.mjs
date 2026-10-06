// Packs the full Fluent UI System Icons 20px set (regular + filled) into one JSON chunk that the icon picker
// and custom launchers load lazily, plus a small list of names for synchronous lookups.
// Run: node scripts/build-icons.mjs   (needs @fluentui/svg-icons from devDependencies)
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const src = join("node_modules", "@fluentui", "svg-icons", "icons");
const out = join("src", "icons", "generated");
mkdirSync(out, { recursive: true });

const files = readdirSync(src).filter((f) => /_20_(regular|filled)\.svg$/.test(f));
const icons = {};
for (const f of files) icons[f.replace(/\.svg$/, "")] = readFileSync(join(src, f), "utf8").trim();
const names = [...new Set(files.filter((f) => f.endsWith("_20_regular.svg")).map((f) => f.replace(/_20_regular\.svg$/, "")))].sort();

writeFileSync(join(out, "all-icons.json"), JSON.stringify(icons));
writeFileSync(join(out, "icon-names.json"), JSON.stringify(names));
console.log(`icons: ${Object.keys(icons).length}, names: ${names.length}`);
