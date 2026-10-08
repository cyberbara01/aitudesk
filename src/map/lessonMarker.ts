// The lesson marker on the plan (nextLesson.ts says which rooms): .room-next on the room groups, which map.css fills
// with the accent (a room with a colour mark keeps its colour), and a ring drawn last in the floor layer, so the rooms
// around it never paint over it: along each room outline a solid accent ring, parted from the room by a thin line of
// the plan's floor plate (the colour of the seams), so it reads on every scheme, also where a room hue is close to the
// accent. Its strokes do not scale (map.css): the ring keeps its screen width at every zoom. Nothing moves: the marker
// is static.
const SVG_NS = "http://www.w3.org/2000/svg";
const RING = "map-next-ring";
const SHAPES = ":scope > polygon, :scope > polyline, :scope > rect";

/** A closed copy of a room outline: the drawing leaves door gaps in its polylines, a marker ring has none. */
function outlineCopy(shape: SVGGraphicsElement, cls: string): SVGElement {
  let copy: SVGElement;
  if (shape instanceof SVGPolylineElement) {
    copy = document.createElementNS(SVG_NS, "polygon");
    copy.setAttribute("points", shape.getAttribute("points") ?? "");
    const tf = shape.getAttribute("transform");
    if (tf) copy.setAttribute("transform", tf);
  } else {
    copy = shape.cloneNode(false) as SVGElement;
    copy.removeAttribute("id");
    copy.removeAttribute("style");
  }
  copy.setAttribute("class", cls);
  return copy;
}

/**
 * Transform from a room group's coordinates to the layer's, from the transform attributes in between; null when
 * there are none. Read from the SVG DOM, so no style is computed (see markRooms).
 */
function toLayer(g: SVGGElement, layer: SVGGElement): DOMMatrix | null {
  let m: DOMMatrix | null = null;
  for (let el: Element | null = g; el && el !== layer; el = el.parentElement) {
    if (!(el instanceof SVGGraphicsElement)) continue;
    const t = el.transform.baseVal.consolidate();
    if (t) m = m ? DOMMatrix.fromMatrix(t.matrix).multiply(m) : DOMMatrix.fromMatrix(t.matrix);
  }
  return m && !m.isIdentity ? m : null;
}

/**
 * Marks the rooms named by `rooms` (exact data-names) in one floor layer and clears an older mark there. Does nothing
 * when exactly these rooms are marked already. Only classes and attributes are written and nothing is measured, so
 * the browser computes the rooms' styles once, with the mark: a floor that mounts marked never fades the accent in.
 */
export function markRooms(layer: SVGGElement, rooms: readonly string[]): void {
  const key = rooms.join("\n");
  const old = layer.querySelector(`:scope > g.${RING}`);
  if ((old?.getAttribute("data-rooms") ?? "") === key) return;
  old?.remove();
  const marked: SVGGElement[] = [];
  for (const g of layer.querySelectorAll<SVGGElement>("g[data-name]")) {
    const hit = rooms.includes(g.getAttribute("data-name") ?? "");
    if (g.classList.contains("room-next") !== hit) g.classList.toggle("room-next", hit);
    if (hit) marked.push(g);
  }
  if (!key) return;
  const ring = document.createElementNS(SVG_NS, "g");
  ring.setAttribute("class", RING);
  ring.setAttribute("data-rooms", key);
  for (const g of marked) {
    // The ring lies in the layer's coordinates: a room inside a transformed group takes that transform along.
    const m = toLayer(g, layer);
    let parent: SVGElement = ring;
    if (m) {
      parent = document.createElementNS(SVG_NS, "g");
      parent.setAttribute("transform", `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
      ring.appendChild(parent);
    }
    for (const shape of g.querySelectorAll<SVGGraphicsElement>(SHAPES)) {
      parent.append(outlineCopy(shape, "ring"), outlineCopy(shape, "gap"));
    }
  }
  layer.appendChild(ring);
}
