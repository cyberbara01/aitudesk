import { memo, useEffect, useState, type CSSProperties } from "react";
import iconNames from "../icons/generated/icon-names.json";

// Fluent UI System Icons, bundled (no network at runtime).
// The small set in src/icons/*.svg is inlined; the full 20 px set (regular + filled) is one JSON chunk,
// loaded on demand by the icon picker and by custom launcher icons.
const eager = import.meta.glob<string>("../icons/*.svg", { query: "?raw", import: "default", eager: true });

const byName = new Map<string, string>();
for (const [path, raw] of Object.entries(eager)) {
  byName.set(path.split("/").pop()!.replace(/\.svg$/, ""), raw);
}

const ALL_SET = new Set<string>(iconNames as string[]);
let allIcons: Promise<Record<string, string>> | null = null;
function loadAll(): Promise<Record<string, string>> {
  allIcons ??= import("../icons/generated/all-icons.json").then((m) => (m.default ?? m) as Record<string, string>);
  return allIcons;
}

export type IconVariant = "regular" | "filled";

/** Every icon name available at 20 px (regular), sorted, for pickers. */
export const ALL_ICON_NAMES: readonly string[] = iconNames as string[];

export function hasIcon(name: string, size: 16 | 20 = 20, variant: IconVariant = "regular"): boolean {
  if (byName.has(`${name}_${size}_${variant}`)) return true;
  return size === 20 && ALL_SET.has(name);
}

/** Resolve an icon's SVG markup: the inlined set synchronously, otherwise from the lazy chunk. */
export async function loadIcon(name: string, size: 16 | 20 = 20, variant: IconVariant = "regular"): Promise<string | null> {
  const key = `${name}_${size}_${variant}`;
  const hit = byName.get(key);
  if (hit) return hit;
  if (!ALL_SET.has(name)) return null;
  const all = await loadAll();
  const raw = all[`${name}_20_${variant}`] ?? all[`${name}_20_regular`];
  if (raw) byName.set(key, raw);
  return raw ?? null;
}

export interface IconProps {
  name: string;
  variant?: IconVariant;
  size?: 16 | 20 | 24;
  className?: string;
  style?: CSSProperties;
}

function syncLookup(name: string, size: 16 | 20, variant: IconVariant): string | undefined {
  return byName.get(`${name}_${size}_${variant}`) ?? byName.get(`${name}_20_${variant}`) ?? byName.get(`${name}_20_regular`);
}

export const Icon = memo(function Icon({ name, variant = "regular", size = 20, className, style }: IconProps) {
  const svgSize: 16 | 20 = size === 16 ? 16 : 20;
  const [raw, setRaw] = useState<string>(() => syncLookup(name, svgSize, variant) ?? "");

  useEffect(() => {
    const sync = syncLookup(name, svgSize, variant);
    if (sync) {
      setRaw(sync);
      return;
    }
    let alive = true;
    loadIcon(name, svgSize, variant).then((r) => {
      if (alive) setRaw(r ?? "");
    });
    return () => {
      alive = false;
    };
  }, [name, svgSize, variant]);

  const cls = ["icon", size === 16 ? "icon-16" : size === 24 ? "icon-24" : "", className ?? ""].filter(Boolean).join(" ");
  return <span className={cls} style={style} aria-hidden="true" dangerouslySetInnerHTML={{ __html: raw }} />;
});
