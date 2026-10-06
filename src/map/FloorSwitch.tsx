// Vertical floor switch (§3): three 36×32 items («3» on top), shared control fill, radius 6; the selected item gets the
// hover fill and a 3×16 accent indicator at the left edge that slides between items (167 ms, --ease-move).
import { useRef, type WheelEvent } from "react";
import { ru } from "../i18n/ru";
import { FLOORS, toFloor, type Floor } from "./types";

interface Props {
  floor: Floor;
  onChange: (f: Floor) => void;
  className?: string;
}

const ITEM_H = 32;
/** Wheel delta accumulated before one floor step (one mouse notch is ~100). */
const WHEEL_STEP = 50;

export function FloorSwitch({ floor, onChange, className }: Props) {
  const acc = useRef(0);

  // Wheel over the switch changes the floor (up = higher). The switch lives outside the zoom wrapper,
  // so the map never zooms from here.
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    acc.current += e.deltaY;
    if (Math.abs(acc.current) < WHEEL_STEP) return;
    const next = toFloor(floor + (acc.current < 0 ? 1 : -1));
    acc.current = 0;
    if (next !== null) onChange(next);
  };

  const index = FLOORS.indexOf(floor);
  const cls = ["floor-switch", className ?? ""].filter(Boolean).join(" ");
  return (
    <div className={cls} role="radiogroup" aria-label={ru.map.floor} onWheel={onWheel}>
      <span className="floor-indicator" style={{ transform: `translateY(${index * ITEM_H}px)` }} aria-hidden="true" />
      {FLOORS.map((f) => (
        <button
          key={f}
          type="button"
          role="radio"
          aria-checked={f === floor}
          aria-label={ru.map.floorN(f)}
          className={f === floor ? "floor-item body-strong selected" : "floor-item body-strong"}
          onClick={() => {
            // Like the original: a click on the current floor is a no-op (it must not clear an active search).
            if (f !== floor) onChange(f);
          }}
        >
          {f}
        </button>
      ))}
    </div>
  );
}
