// Pictures of the own widgets (src-tauri/src/custom.rs): read once as bytes and shown from blob: URLs. A picture
// that may move (GIF, WebP) also gets a still of its first frame for the places that must not move: the folded
// icon, the list in the settings, and the widget itself while Windows battery saver is on.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};
const mimeOf = (file: string) => MIME[file.slice(file.lastIndexOf(".") + 1)] ?? "application/octet-stream";

/** GIF and WebP can be animations. */
export const mayMove = (file: string) => /\.(gif|webp)$/.test(file);

/** The still is drawn at most this many pixels on its long side (it is only ever shown small or while saving power). */
const STILL_MAX = 1024;

export interface WidgetImage {
  /** The picture as it is (an animation moves). */
  url: string;
  /** Its first frame (the same URL for a picture that cannot move). */
  still: string;
}

async function firstFrame(blob: Blob): Promise<Blob | null> {
  const bmp = await createImageBitmap(blob);
  try {
    const k = Math.min(1, STILL_MAX / Math.max(bmp.width, bmp.height, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * k));
    canvas.height = Math.max(1, Math.round(bmp.height * k));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
  } finally {
    bmp.close();
  }
}

/** The picture of a widget: null while it loads, "missing" when the file cannot be read (deleted by hand). */
export function useWidgetImage(file: string | null): WidgetImage | "missing" | null {
  const [image, setImage] = useState<WidgetImage | "missing" | null>(null);

  useEffect(() => {
    setImage(null);
    if (!file) return;
    let alive = true;
    const urls: string[] = [];
    /** A URL for `blob`, released with this effect (at once, if it is already over). */
    const own = (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      if (alive) urls.push(url);
      else URL.revokeObjectURL(url);
      return url;
    };
    (async () => {
      const bytes = await invoke<ArrayBuffer>("read_widget_image", { file });
      if (!alive) return;
      const blob = new Blob([bytes], { type: mimeOf(file) });
      const url = own(blob);
      let still = url;
      if (mayMove(file)) {
        const frame = await firstFrame(blob).catch(() => null);
        if (frame && alive) still = own(frame);
      }
      if (alive) setImage({ url, still });
    })().catch(() => {
      if (alive) setImage("missing");
    });
    return () => {
      alive = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [file]);

  return image;
}
