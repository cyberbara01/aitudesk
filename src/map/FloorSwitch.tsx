// Vertical floor switch (SPEC §3): three 36×32 items («3» on top), shared control fill, radius 6; the selected item
// gets the hover fill and a 3×16 accent indicator at the left edge that slides between items (167 ms, --ease-move).
// A radio group: one Tab stop, arrows move between floors. The wheel over the switch changes the floor. The floor
// with the room of the next lesson (nextLesson.ts), when it is not the one shown, gets a small accent dot.
import { useRef, type WheelEvent } from "react";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.map";
import { onRadioGroupKeyDownClamped } from "../lib/radioGroup";
import { FLOORS, toFloor, type Floor } from "./types";

interface Props {
  floor: Floor;
  onChange: (f: Floor) => void;
  /** Floor whose item shows the next-lesson dot; null for none. */
  dot?: Floor | null;
  className?: string;
}

const ITEM_H = 32;
/** Wheel delta accumulated before one floor step (one mouse notch is ~100, a touchpad sends many small ones). */
const WHEEL_STEP = 50;
/** A pause this long (ms) starts a new gesture: a small leftover from an earlier scroll is forgotten. */
const WHEEL_GESTURE_GAP = 400;

export function FloorSwitch({ floor, onChange, dot = null, className }: Props) {
  const acc = useRef({ sum: 0, at: 0 });

  // Up = higher floor. The switch lies outside the zoom host, so the map never zooms from here.
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    const a = acc.current;
    if (e.timeStamp - a.at > WHEEL_GESTURE_GAP || Math.sign(e.deltaY) !== Math.sign(a.sum)) a.sum = 0;
    a.at = e.timeStamp;
    a.sum += e.deltaY;
    if (Math.abs(a.sum) < WHEEL_STEP) return;
    const next = toFloor(floor + (a.sum < 0 ? 1 : -1));
    a.sum = 0;
    if (next !== null) onChange(next);
  };

  const index = FLOORS.indexOf(floor);
  const cls = ["floor-switch", className ?? ""].filter(Boolean).join(" ");
  return (
    <div className={cls} role="radiogroup" aria-label={ru.map.floor} onWheel={onWheel} onKeyDown={onRadioGroupKeyDownClamped}>
      <span className="floor-indicator" style={{ transform: `translateY(${index * ITEM_H}px)` }} aria-hidden="true" />
      {FLOORS.map((f) => (
        <button
          key={f}
          type="button"
          role="radio"
          aria-checked={f === floor}
          aria-label={f === dot ? extra.floorWithLesson(f) : ru.map.floorN(f)}
          tabIndex={f === floor ? 0 : -1}
          className={f === floor ? "floor-item body-strong selected" : "floor-item body-strong"}
          onClick={() => {
            // Like the original: a click on the current floor is a no-op (it must not clear an active search).
            if (f !== floor) onChange(f);
          }}
        >
          {f}
          {f === dot && <span className="floor-dot" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}
