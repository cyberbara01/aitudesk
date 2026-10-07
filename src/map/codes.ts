// Room codes as real text. The drawing sets every code as glyph paths; at the small sizes the tile shows them
// (6 to 12 px) those are thin anti-aliased shapes, while text is drawn by the font rasteriser: hinted where it is
// upright, in the style's own numeric face and weight, so it stays crisp from the first readable size up to 6×.
// Each code is placed exactly where the drawing has it: centre, reading direction and glyph height come from the
// glyph paths (geometry.ts), the text is the number part of data-name ("C1.2.223K" → "223K"). The <text> is
// appended to its room group once per floor mount (the drawings never re-render), the group gets .has-code and
// map.css hides the glyph paths, so search, marks and the level of detail keep working on the group as before.
// A label whose glyphs do not look like that code keeps the drawing's own paths.
import { labelPlacement } from "./geometry";

/** Cap height of the code faces per em (Segoe UI Variable .70, Inter and JetBrains Mono .73). */
const CAP_HEIGHT = 0.71;
/** A code's length per character, in em, outside which the glyphs are not this code (measured: 0.44 to 0.75). */
const EM_PER_CHAR = { min: 0.35, max: 0.9 };
/** Room groups that carry a code (named areas, the coworking curves and the Mediker logo are not codes). */
const ROOM_GROUPS = 'g[data-name]:not([data-name*="|"]):not(.map-groups-coworking-atameken):not([data-name^="MEDIKER"])';
const CODE = /^\d{3}[A-Z]?$/;
const SVG_NS = "http://www.w3.org/2000/svg";

interface Code {
  text: string;
  transform: string;
  y: string;
  size: string;
}

/** Placements per floor (in the order of the room groups), computed on the first mount of that floor. */
const cache = new Map<string, (Code | null)[]>();

function measure(g: SVGGElement): Code | null {
  const text = (g.getAttribute("data-name") ?? "").trim().split(".").pop() ?? "";
  if (!CODE.test(text)) return null;
  const p = labelPlacement(Array.from(g.querySelectorAll<SVGPathElement>(":scope > path")));
  if (!p || p.height <= 0) return null;
  const size = p.height / CAP_HEIGHT;
  const perChar = p.length / size / text.length;
  if (perChar < EM_PER_CHAR.min || perChar > EM_PER_CHAR.max) return null;
  return {
    text,
    transform: `translate(${p.cx.toFixed(2)} ${p.cy.toFixed(2)}) rotate(${p.angle.toFixed(2)})`,
    // Baseline half a glyph height below the centre: the cap top lands where the drawing's glyphs start.
    y: (p.height / 2).toFixed(2),
    size: size.toFixed(2),
  };
}

/** Sets the codes of one floor drawing as text. Idempotent: a group that already has its text is skipped. */
export function placeCodes(layer: Element, key: string): void {
  const groups = Array.from(layer.querySelectorAll<SVGGElement>(ROOM_GROUPS)).filter((g) => g.querySelector(":scope > path"));
  const cached = cache.get(key);
  const codes = cached && cached.length === groups.length ? cached : groups.map(measure);
  cache.set(key, codes);
  groups.forEach((g, k) => {
    const code = codes[k];
    if (!code || g.querySelector(":scope > text.map-code")) return;
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("class", "map-code");
    t.setAttribute("transform", code.transform);
    t.setAttribute("y", code.y);
    t.setAttribute("font-size", code.size);
    t.textContent = code.text;
    g.appendChild(t);
    g.classList.add("has-code");
  });
}
