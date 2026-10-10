// The pop-up window (src-tauri/src/popup.rs) covers the screen's work area. A folded widget («Маленький»,
// «Средний») opens here: the widget's card grows out of its icon on a spring over the untouched desktop, and a copy of
// the icon's picture flies into the card's header (src/popup/motion.ts). A click beside the card, Esc (unless something inside took
// it: the map search, paint mode, a menu), the close button, the icon again or leaving for another window play it
// all back into the icon. Only one widget is shown at a time; the code of the folded widgets is loaded ahead of
// the first click, so the card opens at once. A room clicked in the schedule while the map is folded opens the
// map here and shows that room.
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { IconButton } from "../components/Button";
import { tileArt } from "../components/Tile";
import { ru } from "../i18n/ru";
import { extra as shell } from "../i18n/ru.extra.shell";
import { EDIT_EVENT } from "../lib/editMode";
import { isMenuOpen } from "../lib/nativeMenu";
import { customIdOf, isCustomLabel, settings, TILE_IDS, type TileId, type TileView } from "../lib/settings";
import { isFoldedView } from "../lib/tileView";
import { useSettings } from "../lib/useSettings";
import { useWidgetImage } from "../lib/widgetImage";
import { PopupContext } from "./context";
import { CLOSE, OPEN, cardStart, fly, flyStart, morph, progressAt, shellStart, type Rect } from "./motion";

const v = shell.views;
/** CSS px: the card's header (popup.rs HEADER), the icon in it and the room left of that icon (popup.css). */
const HEAD = 52;
const HEAD_ART = 32;
const HEAD_PAD = 14;
/** The folded face's icon (base.css .tile-face-art) and, on a medium face, the room left of it (border + padding). */
const FACE_ART = 40;
const FACE_PAD = 13;
/** The widgets' corners («Углы виджетов», CSS --r-tile): the card leaves the icon with them. */
const tileRadius = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--r-tile")) || 8;
/** After the icon on the desktop got its picture back, the page lets go of the card (no blink in between). */
const LET_GO_MS = 40;
/** Leaving for another window closes the pop-up; a short wait skips focus that only passes through. */
const BLUR_MS = 120;

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

/** popup.rs Show: physical px relative to this window. */
interface Payload {
  label: string;
  iconX: number;
  iconY: number;
  iconW: number;
  iconH: number;
  cardX: number;
  cardY: number;
  cardW: number;
  cardH: number;
  room: string | null;
}

interface Show {
  label: string;
  /** The widget's icon on the desktop and the card, CSS px of this page. */
  icon: Rect;
  card: Rect;
  room: string | null;
  /** Counts the openings: a new one plays the opening again. */
  seq: number;
  /** Counts every request, also a room asked for while the map is already open here. */
  ask: number;
}

/** Where things are: the icon and the card, the icon's picture on the face and in the header, the card's corners. */
interface Geometry {
  icon: Rect;
  card: Rect;
  faceArt: Rect;
  headArt: Rect;
  radius: number;
}

function geometry(show: Show, view: TileView | undefined): Geometry {
  const { icon, card } = show;
  const faceArt: Rect = {
    x: view === "medium" ? icon.x + FACE_PAD : icon.x + (icon.w - FACE_ART) / 2,
    y: icon.y + (icon.h - FACE_ART) / 2,
    w: FACE_ART,
    h: FACE_ART,
  };
  const headArt: Rect = { x: card.x + HEAD_PAD, y: card.y + (HEAD - HEAD_ART) / 2, w: HEAD_ART, h: HEAD_ART };
  const rCard = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--r-card")) || 8;
  return { icon, card, faceArt, headArt, radius: Math.max(12, rCard + 6, tileRadius()) };
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The icon of an own widget in the header: its picture's first frame. */
function CustomArt({ file }: { file: string }) {
  const image = useWidgetImage(file);
  return image && image !== "missing" ? <img className="custom-thumb" src={image.still} alt="" draggable={false} /> : null;
}

interface Motion {
  kind: "open" | "close";
  anims: Animation[];
  started: number;
}

export function PopupHost() {
  const s = useSettings();
  const [show, setShow] = useState<Show | null>(null);
  const shownRef = useRef<Show | null>(null);
  const seq = useRef(0);
  const ask = useRef(0);
  const put = useCallback((next: Show | null) => {
    shownRef.current = next;
    setShow(next);
  }, []);

  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const flyRef = useRef<HTMLSpanElement>(null);
  const headArtRef = useRef<HTMLSpanElement>(null);
  const motion = useRef<Motion | null>(null);
  const closing = useRef(false);

  const stop = useCallback(() => {
    for (const a of motion.current?.anims ?? []) a.cancel();
    motion.current = null;
  }, []);

  useEffect(() => {
    const offs: Array<() => void> = [];
    void listen<Payload>("popup-show", (e) => {
      const p = e.payload;
      const dpr = window.devicePixelRatio || 1;
      // The same widget asked for again while it is open (a room for the map): the card stays, the map hears it.
      const prev = shownRef.current;
      const keep = prev !== null && prev.label === p.label && !closing.current;
      if (!keep) {
        stop();
        closing.current = false;
        seq.current += 1;
      }
      ask.current += 1;
      put({
        label: p.label,
        icon: { x: p.iconX / dpr, y: p.iconY / dpr, w: p.iconW / dpr, h: p.iconH / dpr },
        card: { x: p.cardX / dpr, y: p.cardY / dpr, w: p.cardW / dpr, h: p.cardH / dpr },
        room: p.room,
        seq: keep && prev ? prev.seq : seq.current,
        ask: ask.current,
      });
    }).then((u) => offs.push(u));
    // Closed (after the closing played, or by the native side: the widget went out of sight, the views changed):
    // a moment later nothing is drawn any more, then the window is parked.
    void listen<string | null>("popup-state", (e) => {
      if (e.payload !== null) return;
      const was = shownRef.current;
      window.setTimeout(() => {
        if (shownRef.current !== was) return;
        stop();
        closing.current = false;
        put(null);
      }, LET_GO_MS);
    }).then((u) => offs.push(u));
    return () => offs.forEach((u) => u());
  }, [put, stop]);

  // The opening: the first frame shows the card and the copy of the icon's picture over the icon, both still clear
  // (the icon shows through); two frames later, with the window surely on screen, everything moves.
  useLayoutEffect(() => {
    const cur = shownRef.current;
    const [stage, card, shellEl, shadow, content, flyEl, headArt] = [
      stageRef.current,
      cardRef.current,
      shellRef.current,
      shadowRef.current,
      contentRef.current,
      flyRef.current,
      headArtRef.current,
    ];
    if (!cur || !stage || !card || !shellEl || !shadow || !content || !flyEl || !headArt) return;
    const g = geometry(cur, settings.get().tileViews[cur.label]);
    const reduced = reducedMotion();
    if (reduced) {
      card.style.opacity = "0";
    } else {
      card.style.transform = cardStart(g.icon, g.card);
      shellEl.style.borderRadius = shellStart(g.icon, g.card, tileRadius());
      shellEl.style.opacity = "0";
      shadow.style.opacity = "0";
      content.style.opacity = "0";
      flyEl.style.transform = flyStart(g.faceArt, g.headArt);
      flyEl.style.opacity = "0";
      flyEl.style.visibility = "visible";
      headArt.style.visibility = "hidden";
    }

    const start = () => {
      const anims: Animation[] = [];
      const forwards = { fill: "forwards" as const };
      if (reduced) {
        anims.push(card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, ...forwards }));
      } else {
        const { cardFrames, shellFrames, shadowFrames } = morph(g.icon, g.card, tileRadius(), g.radius, OPEN.points);
        const timing = { duration: OPEN.ms, easing: "linear", ...forwards };
        anims.push(card.animate(cardFrames, timing));
        anims.push(shellEl.animate(shellFrames, timing));
        anims.push(shadow.animate(shadowFrames, timing));
        anims.push(flyEl.animate(fly(g.faceArt, g.headArt, OPEN.points), timing));
        anims.push(
          content.animate(
            [
              { opacity: 0, offset: 0 },
              { opacity: 0, offset: 0.16 },
              { opacity: 1, offset: 0.5 },
              { opacity: 1, offset: 1 },
            ],
            timing,
          ),
        );
      }
      const run: Motion = { kind: "open", anims, started: performance.now() };
      motion.current = run;
      void Promise.all(anims.map((a) => a.finished))
        .then(() => {
          if (motion.current !== run) return;
          // At rest: the end state is written down and the animations let go, so nothing stays on the compositor.
          card.style.transform = "";
          card.style.opacity = "";
          shellEl.style.borderRadius = "";
          shellEl.style.opacity = "";
          shadow.style.opacity = "";
          content.style.opacity = "";
          flyEl.style.visibility = "hidden";
          flyEl.style.opacity = "";
          headArt.style.visibility = "";
          for (const a of anims) a.cancel();
          motion.current = null;
          // The widget's own measurements (the map's zoom point) are read again now that the card stands still.
          window.dispatchEvent(new Event("popup-settled"));
        })
        .catch(() => undefined);
    };
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(start);
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [show?.seq]);

  // Closing: from wherever the card is (an opening still under way included) back into the icon, the copy of the
  // picture fading onto the icon's own; then the native side hears it and the window goes.
  const close = useCallback(() => {
    const cur = shownRef.current;
    const [stage, card, shellEl, shadow, content, flyEl, headArt] = [
      stageRef.current,
      cardRef.current,
      shellRef.current,
      shadowRef.current,
      contentRef.current,
      flyRef.current,
      headArtRef.current,
    ];
    if (!cur || closing.current || !stage || !card || !shellEl || !shadow || !content || !flyEl || !headArt) return;
    closing.current = true;
    stage.classList.add("closing");
    const g = geometry(cur, settings.get().tileViews[cur.label]);
    const reduced = reducedMotion();
    let from = 1;
    const running = motion.current;
    if (running?.kind === "open") {
      from = progressAt(OPEN, performance.now() - running.started);
      for (const a of running.anims) {
        try {
          a.commitStyles();
        } catch {
          /* an element that is gone has nothing to keep */
        }
        a.cancel();
      }
    }
    motion.current = null;
    const anims: Animation[] = [];
    const forwards = { fill: "forwards" as const };
    const fadeFrom = (el: HTMLElement) => Number(getComputedStyle(el).opacity) || 0;
    if (reduced) {
      anims.push(card.animate([{ opacity: fadeFrom(card) }, { opacity: 0 }], { duration: 140, ...forwards }));
    } else {
      const ps = CLOSE.points.map((q) => from * (1 - q));
      const { cardFrames, shellFrames, shadowFrames } = morph(g.icon, g.card, tileRadius(), g.radius, ps);
      const timing = { duration: CLOSE.ms, easing: "linear", ...forwards };
      headArt.style.visibility = "hidden";
      flyEl.style.visibility = "visible";
      anims.push(card.animate(cardFrames, timing));
      anims.push(shellEl.animate(shellFrames, timing));
      anims.push(shadow.animate(shadowFrames, timing));
      anims.push(flyEl.animate(fly(g.faceArt, g.headArt, ps), timing));
      anims.push(content.animate([{ opacity: fadeFrom(content), offset: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 0, offset: 1 }], timing));
    }
    const run: Motion = { kind: "close", anims, started: performance.now() };
    motion.current = run;
    void Promise.all(anims.map((a) => a.finished))
      .then(() => {
        if (motion.current === run) void invoke("close_popup").catch(() => undefined);
      })
      .catch(() => undefined);
  }, []);

  // Esc closes, once everything inside had its say (the map search clears first, paint mode ends first).
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      window.setTimeout(() => {
        if (!e.defaultPrevented) close();
      }, 0);
    };
    // Another window came to the front (a click on the taskbar, Alt+Tab, a link that opened the browser): the
    // pop-up goes, so the card never stays behind other windows. A menu of the widget keeps it.
    let blurTimer = 0;
    const onBlur = () => {
      window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        if (!document.hasFocus() && !isMenuOpen()) close();
      }, BLUR_MS);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
      window.clearTimeout(blurTimer);
    };
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
  const { card } = show;
  const head = { x: card.x + HEAD_PAD, y: card.y + (HEAD - HEAD_ART) / 2 };

  return (
    <div ref={stageRef} key={show.seq} className="popup-stage">
      <div
        className="popup-backdrop"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget && e.button === 0) close();
        }}
      />
      <section
        ref={cardRef}
        className="popup-card"
        style={{ left: card.x, top: card.y, width: card.w, height: card.h }}
        role="dialog"
        aria-label={name}
      >
        <div ref={shadowRef} className="popup-shadow" />
        <div ref={shellRef} className="popup-shell" />
        <div ref={contentRef} className="popup-content">
          <header className="popup-head">
            <span ref={headArtRef} className="popup-art" aria-hidden="true">
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
        </div>
      </section>
      <span ref={flyRef} className="popup-art popup-fly" style={{ left: head.x, top: head.y }} aria-hidden="true">
        {art}
      </span>
    </div>
  );
}
