// Packs the launcher icons listed in src/icons/catalog.json (Fluent UI System Icons, 20 px, regular + filled)
// into one JSON chunk that the icon picker and the launchers load lazily, plus the list of names in catalog
// order for synchronous lookups. The catalog is short on purpose: icons that say at a glance what a launcher
// opens, each with Russian search words.
// Run: node scripts/build-icons.mjs   (needs @fluentui/svg-icons from devDependencies)
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const src = join("node_modules", "@fluentui", "svg-icons", "icons");
const out = join("src", "icons", "generated");
mkdirSync(out, { recursive: true });

const catalog = JSON.parse(readFileSync(join("src", "icons", "catalog.json"), "utf8"));
const names = [];
const icons = {};
for (const { name } of catalog) {
  if (names.includes(name)) throw new Error(`duplicate icon in the catalog: ${name}`);
  for (const variant of ["regular", "filled"]) {
    const file = join(src, `${name}_20_${variant}.svg`);
    if (!existsSync(file)) throw new Error(`not in the Fluent set: ${name} (${variant})`);
    icons[`${name}_20_${variant}`] = readFileSync(file, "utf8").trim();
  }
  names.push(name);
}

writeFileSync(join(out, "all-icons.json"), JSON.stringify(icons));
writeFileSync(join(out, "icon-names.json"), JSON.stringify(names));
console.log(`icons: ${Object.keys(icons).length}, names: ${names.length}`);
