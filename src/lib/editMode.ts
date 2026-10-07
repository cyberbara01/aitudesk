// Edit mode: drag the whole tile, resize the map by its bottom-right grip,
// snap to an 8 px grid and to the screen edges with a 24 px margin; Esc exits and positions are saved.
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

export interface EditModeOptions {
  label: string;
  resizable?: boolean;
  /** Logical px. */
  minSize?: { w: number; h: number };
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

export function useEditMode({ label, resizable = false, minSize = { w: 400, h: 220 } }: EditModeOptions) {
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false);
  editingRef.current = editing;

  useEffect(() => {
    let off: (() => void) | undefined;
    listen<boolean>(EDIT_EVENT, (e) => setEditing(Boolean(e.payload))).then((u) => (off = u));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && editingRef.current) setEditMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      off?.();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const save = useCallback(async () => {
    const win = getCurrentWindow();
    const [pos, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
    await invoke("save_rect", { label, x: pos.x, y: pos.y, w: size.width, h: size.height });
  }, [label]);

  const onDragStart = useCallback(
    async (e: React.PointerEvent<HTMLElement>) => {
      if (!editingRef.current || e.button !== 0) return;
      if ((e.target as HTMLElement).closest(".resize-grip")) return;
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const win = getCurrentWindow();
      const [start, size, wa] = await Promise.all([
        win.outerPosition(),
        win.outerSize(),
        invoke<WorkArea>("get_work_area"),
      ]);
      const s = wa.scale;
      const origin = { x: e.screenX, y: e.screenY };
      let raf = 0;
      let next: { x: number; y: number } | null = null;
      const flush = () => {
        raf = 0;
        if (next) win.setPosition(new PhysicalPosition(next.x, next.y));
      };
      const move = (ev: PointerEvent) => {
        const x = start.x + (ev.screenX - origin.x) * s;
        const y = start.y + (ev.screenY - origin.y) * s;
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
        await save();
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    },
    [save],
  );

  const onResizeStart = useCallback(
    async (e: React.PointerEvent<HTMLElement>) => {
      if (!editingRef.current || !resizable || e.button !== 0) return;
      e.stopPropagation();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const win = getCurrentWindow();
      const [size, wa] = await Promise.all([win.outerSize(), invoke<WorkArea>("get_work_area")]);
      const s = wa.scale;
      const g = GRID * s;
      const origin = { x: e.screenX, y: e.screenY };
      let raf = 0;
      let next: { w: number; h: number } | null = null;
      const flush = () => {
        raf = 0;
        if (next) win.setSize(new PhysicalSize(next.w, next.h));
      };
      const move = (ev: PointerEvent) => {
        const w = Math.max(minSize.w * s, size.width + (ev.screenX - origin.x) * s);
        const h = Math.max(minSize.h * s, size.height + (ev.screenY - origin.y) * s);
        next = { w: Math.round(Math.round(w / g) * g), h: Math.round(Math.round(h / g) * g) };
        if (!raf) raf = requestAnimationFrame(flush);
      };
      const up = async () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        if (raf) cancelAnimationFrame(raf);
        if (next) await win.setSize(new PhysicalSize(next.w, next.h));
        await save();
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    },
    [resizable, minSize.w, minSize.h, save],
  );

  return { editing, onDragStart, onResizeStart, start: () => setEditMode(true), stop: () => setEditMode(false) };
}
