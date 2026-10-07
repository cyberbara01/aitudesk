// Fluent icon markup cached inside a launcher (icon.svg of a custom launcher or of a built-in's edit). The
// desktop tile draws the cached copy directly, so it never has to load the full icon set (a 3 MB chunk); the
// settings window fills the cache when a launcher is saved, and once for launchers saved before the cache
// existed.
import { hasIcon, loadIcon } from "../../components/Icon";
import { isIconMarkup } from "../../lib/launchers";
import type { LauncherIcon } from "../../lib/settings";

/**
 * The cached markup of a Fluent launcher icon, only when it can be trusted: the name is one of our icons and
 * the string has exactly the shape of our icon files (isIconMarkup). Anything else returns undefined and the
 * caller falls back to the icon set by name.
 */
export function trustedIconSvg(icon: LauncherIcon): string | undefined {
  if (icon.kind !== "fluent" || !icon.svg || !hasIcon(icon.name)) return undefined;
  return isIconMarkup(icon.svg) ? icon.svg : undefined;
}

/**
 * Markup to cache for a Fluent icon: 20 px regular from our own set (the eager icons resolve at once, the
 * rest come from the lazy chunk). Undefined for a name outside the set.
 */
export async function iconSvgFor(name: string): Promise<string | undefined> {
  if (!hasIcon(name)) return undefined;
  try {
    const svg = (await loadIcon(name, 20, "regular"))?.trim();
    return svg && isIconMarkup(svg) ? svg : undefined;
  } catch {
    return undefined;
  }
}
