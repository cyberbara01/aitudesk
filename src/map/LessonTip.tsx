// Bubble over the room of the next lesson (the kit .tooltip look): the lesson title, or «Пара» while the schedule hides
// its texts, then when it runs («Сейчас · до 10:50», «Далее · через 12 мин»). Below the visible part of the room,
// above it when there is no space, always inside the window, like the kit Tooltip. The tile renders it outside
// .map-root: inside that size container, position: fixed would be relative to the container.
import { useLayoutEffect, useRef, useState } from "react";

/** Distance from the room and from the window edges (= --s1, as the kit Tooltip). */
const GAP = 4;

interface Props {
  /** The room's box in window px. */
  anchor: DOMRect;
  title: string;
  when: string;
}

export function LessonTip({ anchor, title, when }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const t = ref.current?.getBoundingClientRect();
    if (!t) return;
    const { innerWidth: vw, innerHeight: vh } = window;
    // Zoomed in, the room can run past the window: place the bubble by the part that is shown.
    const top0 = Math.max(0, anchor.top);
    const bottom0 = Math.min(vh, anchor.bottom);
    const centre = (Math.max(0, anchor.left) + Math.min(vw, anchor.right)) / 2;
    const left = Math.max(GAP, Math.min(centre - t.width / 2, vw - t.width - GAP));
    let top = bottom0 + GAP;
    if (top + t.height > vh - GAP) top = top0 - GAP - t.height;
    top = Math.max(GAP, Math.min(top, vh - t.height - GAP));
    setPos({ left, top });
  }, [anchor, title, when]);

  return (
    <div ref={ref} role="tooltip" className="tooltip map-next-tip" style={pos ?? { left: 0, top: 0, visibility: "hidden" }}>
      <span className="map-next-tip-title">{title}</span>
      <span>{when}</span>
    </div>
  );
}
