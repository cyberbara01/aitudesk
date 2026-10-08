// Edit mode: drag the whole tile, resize it by its bottom-right grip, snap to an 8 px grid and to the screen
// edges with a 24 px margin; Esc exits and positions are saved. Every move or resize of the session can be
// undone, the last one first («Отменить» on the tile, its menu, Ctrl+Z).
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";

export const EDIT_EVENT = "edit-mode";

interface WorkArea {
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
}

/** A tile's place on screen in physical px, as the window reports it. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Steps kept per tile and session: far more than anyone undoes, small enough to never matter. */
const UNDO_LIMIT = 50;

const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

const VK_Z = 0x5a;

export interface EditModeOptions {
  label: string;
  resizable?: boolean;
  /** CSS px of the widget page (logical px when «Масштаб виджетов» is 100 %). */
  minSize?: { w: number; h: number };
  /** A resize ended with a new size (a «Большой» widget becomes «Вручную»). */
  onResized?: () => void;
}

const GRID = 8;
const MARGIN = 24;
const SNAP = 12;

function snapAxis(v: number, size: number, origin: number, extent: number, scale: number): number {
  const g = GRID * scale;
  const m = MARGIN * scale;
  const thr = SNAP * scale;
  let out = origin + Math.round((v - origin) / g) * g;
  if (Math.abs(out - (origin + m)) <= thr) out = origin + m;
  if (Math.abs(out + size - (origin + extent - m)) <= thr) out = origin + extent - m - size;
  return Math.round(out);
}

export function setEditMode(on: boolean) {
  return emit(EDIT_EVENT, on);
}

export function useEditMode({ label, resizable = false, minSize = { w: 400, h: 220 }, onResized }: EditModeOptions) {
  const [editing, setEditing] = useState(false);
  const onResizedRef = useRef(onResized);
  onResizedRef.current = onResized;
  const editingRef = useRef(false);
  editingRef.current = editing;
  /** Where the tile was before each move or resize of this session, the latest last. */
  const history = useRef<Rect[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  const save = useCallback(async () => {
    const win = getCurrentWindow();
    const [pos, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
    await invoke("save_rect", { label, x: pos.x, y: pos.y, w: size.width, h: size.height });
  }, [label]);

  /** A finished move or resize: remember where the tile was, unless nothing changed. */
  const remember = useCallback((before: Rect, after: Rect) => {
    if (sameRect(before, after)) return;
    history.current.push(before);
    if (history.current.length > UNDO_LIMIT) history.current.shift();
    setCanUndo(true);
  }, []);

  /** Back to where the tile was before its last move or resize; again for the one before. */
  const undo = useCallback(async () => {
    const prev = history.current.pop();
    setCanUndo(history.current.length > 0);
    if (!prev) return;
    const win = getCurrentWindow();
    await win.setSize(new PhysicalSize(prev.w, prev.h));
    await win.setPosition(new PhysicalPosition(prev.x, prev.y));
    await save();
  }, [save]);
  const undoRef = useRef(undo);
  undoRef.current = undo;

  // A new session starts with nothing to undo.
  useEffect(() => {
    if (!editing) {
      history.current = [];
      setCanUndo(false);
    }
  }, [editing]);

  useEffect(() => {
    let off: (() => void) | undefined;
    listen<boolean>(EDIT_EVENT, (e) => setEditing(Boolean(e.payload))).then((u) => (off = u));
    const onKey = (e: KeyboardEvent) => {
      if (!editingRef.current) return;
      if (e.key === "Escape") setEditMode(false);
      // keyCode is the Windows virtual key: VK_Z is the key labelled Z in any Latin layout and the same key
      // in the Russian one, as in every Windows app.
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.keyCode === VK_Z) {
        e.preventDefault();
        void undoRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      off?.();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const onDragStart = useCallback(
    async (e: React.PointerEvent<HTMLElement>) => {
      if (!editingRef.current || e.button !== 0) return;
      if ((e.target as HTMLElement).closest(".resize-grip")) return;
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      // The keyboard follows the tile being arranged, so Esc and Ctrl+Z reach it.
      invoke("activate_tile").catch(() => undefined);
      const win = getCurrentWindow();
      const [start, size, wa] = await Promise.all([
        win.outerPosition(),
        win.outerSize(),
        invoke<WorkArea>("get_work_area"),
      ]);
      // Pointer screen coordinates are the monitor's logical px (the page zoom, «Масштаб виджетов», leaves them
      // alone); the grid and the margins are the page's CSS px, so they shrink with the widgets.
      const ms = wa.scale;
      const s = window.devicePixelRatio || wa.scale;
      const before: Rect = { x: start.x, y: start.y, w: size.width, h: size.height };
      const origin = { x: e.screenX, y: e.screenY };
      let raf = 0;
      let next: { x: number; y: number } | null = null;
      const flush = () => {
        raf = 0;
        if (next) win.setPosition(new PhysicalPosition(next.x, next.y));
      };
      const move = (ev: PointerEvent) => {
        const x = start.x + (ev.screenX - origin.x) * ms;
        const y = start.y + (ev.screenY - origin.y) * ms;
        next = {
          x: snapAxis(x, size.width, wa.x, wa.w, s),
          y: snapAxis(y, size.height, wa.y, wa.h, s),
        };
        if (!raf) raf = requestAnimationFrame(flush);
      };
      const up = async () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        if (raf) cancelAnimationFrame(raf);
        if (next) await win.setPosition(new PhysicalPosition(next.x, next.y));
        remember(before, { ...before, ...(next ?? {}) });
        await save();
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    },
    [save, remember],
  );

  const onResizeStart = useCallback(
    async (e: React.PointerEvent<HTMLElement>) => {
      if (!editingRef.current || !resizable || e.button !== 0) return;
      e.stopPropagation();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      invoke("activate_tile").catch(() => undefined);
      const win = getCurrentWindow();
      const [size, pos, wa] = await Promise.all([win.outerSize(), win.outerPosition(), invoke<WorkArea>("get_work_area")]);
      const before: Rect = { x: pos.x, y: pos.y, w: size.width, h: size.height };
      const ms = wa.scale;
      const s = window.devicePixelRatio || wa.scale;
      const g = GRID * s;
      const origin = { x: e.screenX, y: e.screenY };
      let raf = 0;
      let next: { w: number; h: number } | null = null;
      const flush = () => {
        raf = 0;
        if (next) win.setSize(new PhysicalSize(next.w, next.h));
      };
      const move = (ev: PointerEvent) => {
        const w = Math.max(minSize.w * s, size.width + (ev.screenX - origin.x) * ms);
        const h = Math.max(minSize.h * s, size.height + (ev.screenY - origin.y) * ms);
        next = { w: Math.round(Math.round(w / g) * g), h: Math.round(Math.round(h / g) * g) };
        if (!raf) raf = requestAnimationFrame(flush);
      };
      const up = async () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        if (raf) cancelAnimationFrame(raf);
        if (next) await win.setSize(new PhysicalSize(next.w, next.h));
        remember(before, { ...before, ...(next ?? {}) });
        await save();
        if (next && (next.w !== before.w || next.h !== before.h)) onResizedRef.current?.();
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    },
    [resizable, minSize.w, minSize.h, save, remember],
  );

  return {
    editing,
    canUndo,
    undo,
    onDragStart,
    onResizeStart,
    start: () => setEditMode(true),
    stop: () => setEditMode(false),
  };
}
