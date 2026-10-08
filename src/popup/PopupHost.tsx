// The pop-up window (src-tauri/src/popup.rs): a folded widget («Маленький», «Средний») opens here, whole, in a
// card in the middle of the screen, under its name and a close button. The card grows from the side of its icon and
// fades in; closing plays it backwards before the window is parked. Esc closes it too (unless something inside took
// the Esc: the map search, paint mode, a menu). Only one widget is shown at a time; its code is loaded ahead of the
// first click for the widgets that are folded, so the card opens at once. Its icon clicked again closes it, with the
// same animation. A room clicked in the schedule while the map is folded opens the map here and shows that room.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { IconButton } from "../components/Button";
import { tileArt } from "../components/Tile";
import { ru } from "../i18n/ru";
import { extra as shell } from "../i18n/ru.extra.shell";
import { EDIT_EVENT } from "../lib/editMode";
import { customIdOf, isCustomLabel, TILE_IDS, type TileId } from "../lib/settings";
import { isFoldedView } from "../lib/tileView";
import { useSettings } from "../lib/useSettings";
import { useWidgetImage } from "../lib/widgetImage";
import { PopupContext } from "./context";

const v = shell.views;
/** Logical px around the card (its shadow) and the header: the same as popup.rs MARGIN and HEADER. */
const MARGIN = 32;
/** The closing animation (popup.css .popup-card.leaving). */
const OUT_MS = 150;

type Loader = () => Promise<{ default: ComponentType }>;
const LOADERS: Record<TileId, Loader> = {
  clock: () => import("../tiles/Clock").then((m) => ({ default: m.ClockTile })),
  system: () => import("../tiles/System").then((m) => ({ default: m.SystemTile })),
  perf: () => import("../tiles/Perf").then((m) => ({ default: m.PerfTile })),
  launchers: () => import("../tiles/Launchers").then((m) => ({ default: m.LaunchersTile })),
  map: () => import("../tiles/Map").then((m) => ({ default: m.MapTile })),
  schedule: () => import("../tiles/Schedule").then((m) => ({ default: m.ScheduleTile })),
  notes: () => import("../tiles/Notes").then((m) => ({ default: m.NotesTile })),
};
const WIDGETS = Object.fromEntries(TILE_IDS.map((id) => [id, lazy(LOADERS[id])])) as unknown as Record<TileId, ComponentType>;
const loadCustom = () => import("../tiles/Custom");
const CustomTile = lazy(() => loadCustom().then((m) => ({ default: m.CustomTile })));

interface Show {
  label: string;
  /** The icon, relative to this window (physical px). */
  iconX: number;
  iconY: number;
  iconW: number;
  iconH: number;
  room: string | null;
  /** Counts the openings: a new one plays the opening animation again. */
  seq: number;
  /** Counts every request, also a room asked for while the map is already open here. */
  ask: number;
}

/** The icon of an own widget in the header: its picture's first frame. */
function CustomArt({ file }: { file: string }) {
  const image = useWidgetImage(file);
  return image && image !== "missing" ? <img className="custom-thumb" src={image.still} alt="" draggable={false} /> : null;
}

export function PopupHost() {
  const s = useSettings();
  const [show, setShow] = useState<Show | null>(null);
  const shownRef = useRef<Show | null>(null);
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const closeTimer = useRef(0);
  const seq = useRef(0);
  const ask = useRef(0);
  const put = useCallback((next: Show | null) => {
    shownRef.current = next;
    setShow(next);
  }, []);

  useEffect(() => {
    const offs: Array<() => void> = [];
    void listen<Omit<Show, "seq" | "ask">>("popup-show", (e) => {
      // The same widget asked for again while it is open (a room for the map): the card stays, the map hears it.
      const prev = shownRef.current;
      const keep = prev !== null && prev.label === e.payload.label && !leavingRef.current;
      // A widget opened while another one was closing: that closing is over.
      window.clearTimeout(closeTimer.current);
      leavingRef.current = false;
      setLeaving(false);
      if (!keep) seq.current += 1;
      ask.current += 1;
      put({ ...e.payload, seq: seq.current, ask: ask.current });
    }).then((u) => offs.push(u));
    // Closed by the native side (the widget went out of sight, the views changed): nothing stays drawn.
    void listen<string | null>("popup-state", (e) => {
      if (e.payload === null) put(null);
    }).then((u) => offs.push(u));
    return () => offs.forEach((u) => u());
  }, [put]);

  const close = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    closeTimer.current = window.setTimeout(() => {
      void invoke("close_popup").finally(() => {
        if (leavingRef.current) put(null);
      });
    }, OUT_MS);
  }, [put]);

  // Esc closes, once everything inside had its say (the map search clears first, paint mode ends first).
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      window.setTimeout(() => {
        if (!e.defaultPrevented) close();
      }, 0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, close]);

  // Its icon clicked again: it closes the same way as with its button.
  useEffect(() => {
    let off: (() => void) | undefined;
    void listen("popup-close", () => close()).then((u) => (off = u));
    return () => off?.();
  }, [close]);

  // Arranging the widgets: the pop-up gives way.
  useEffect(() => {
    let off: (() => void) | undefined;
    void listen<boolean>(EDIT_EVENT, (e) => {
      if (e.payload) close();
    }).then((u) => (off = u));
    return () => off?.();
  }, [close]);

  // The code of the folded widgets loads while nobody waits, so a click opens the card at once.
  const folded = useMemo(() => Object.keys(s.tileViews).filter((l) => isFoldedView(s.tileViews[l])), [s.tileViews]);
  useEffect(() => {
    const idle = window.setTimeout(() => {
      for (const l of folded) {
        if (isCustomLabel(l)) void loadCustom();
        else if (l in LOADERS) void LOADERS[l as TileId]();
      }
    }, 400);
    return () => window.clearTimeout(idle);
  }, [folded]);

  // The map reads the room it was opened for from here (usePopup), once it is drawn.
  const api = useMemo(() => (show ? { label: show.label, close, room: show.room, ask: show.ask } : null), [show, close]);
  if (!show || !api) return null;

  const custom = isCustomLabel(show.label) ? s.customWidgets.find((w) => w.id === customIdOf(show.label)) : undefined;
  const name = custom ? custom.name.trim() || shell.custom.unnamed : (ru.tiles as Record<string, string>)[show.label] ?? "";
  const art = custom ? <CustomArt file={custom.file} /> : tileArt(show.label);
  const Widget = isCustomLabel(show.label) ? null : WIDGETS[show.label as TileId];

  // The card grows from the side of the icon: its transform origin is the icon's centre, kept near the card.
  const dpr = window.devicePixelRatio || 1;
  const cardW = window.innerWidth - 2 * MARGIN;
  const cardH = window.innerHeight - 2 * MARGIN;
  const ox = Math.min(Math.max((show.iconX + show.iconW / 2) / dpr - MARGIN, -cardW * 0.25), cardW * 1.25);
  const oy = Math.min(Math.max((show.iconY + show.iconH / 2) / dpr - MARGIN, -cardH * 0.25), cardH * 1.25);
  const origin = { transformOrigin: `${Math.round(ox)}px ${Math.round(oy)}px` } as CSSProperties;

  return (
    <div className="popup-stage">
      <section key={show.seq} className={leaving ? "popup-card leaving" : "popup-card"} style={origin} role="dialog" aria-label={name}>
        <header className="popup-head">
          <span className="popup-art" aria-hidden="true">
            {art}
          </span>
          <span className="popup-name ellipsis">{name}</span>
          <IconButton icon="dismiss" variant="subtle" label={v.close} className="popup-close" onClick={close} />
        </header>
        <div className="popup-body">
          <PopupContext.Provider value={api}>
            <Suspense fallback={null}>{Widget ? <Widget key={show.label} /> : <CustomTile key={show.label} label={show.label} />}</Suspense>
          </PopupContext.Provider>
        </div>
      </section>
    </div>
  );
}
