import { useEffect, useMemo, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { Icon, hasIcon } from "../../components/Icon";
import { isImageDataUrl, launcherInk, letterOf } from "../../lib/launchers";
import type { LauncherIcon as LauncherIconSpec } from "../../lib/settings";
import { trustedIconSvg } from "./iconCache";

/** Everything a cell needs to draw a launcher (a LauncherItem or CustomLauncher fits). */
export interface LauncherLook {
  /** Full name: accessible name of the cell, source of the letter fallback. */
  name: string;
  /** Text under the square when it differs from the name (short tile names of the built-ins). */
  caption?: string;
  url: string;
  icon: LauncherIconSpec;
  /** #RRGGBB tint. */
  color: string;
}

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

/**
 * Site image 28×28: a fetched icon cached in the launcher, or the bundled icon of a university site (the
 * built-ins' original look), both data: URLs. Falls back to the letter if the data URL cannot be decoded.
 */
function SiteImage({ data, fallback }: { data: string; fallback: ReactNode }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [data]);
  if (broken) return <>{fallback}</>;
  return <img className="ln-img" src={data} alt="" draggable={false} decoding="async" onError={() => setBroken(true)} />;
}

/**
 * Fluent glyph, cheapest source first: the markup cached in the launcher (no icon-set load at all), then the
 * icon set by name (launchers saved before the cache, and a built-in's Fluent icon when its address leads off
 * the university's sites, which is in the eager set), then the letter for a name that is not in the set.
 */
function FluentGlyph({ name, svg, fallback }: { name: string; svg?: string; fallback: ReactNode }) {
  const cached = useMemo(() => trustedIconSvg({ kind: "fluent", name, svg }), [name, svg]);
  if (cached) return <span className="icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: cached }} />;
  if (hasIcon(name)) return <Icon name={name} />;
  return <>{fallback}</>;
}

/**
 * 36×36 square tinted with the launcher colour: Fluent icon (20 px) · site image (28 px, the built-ins'
 * default) · first letter. The glyph takes the colour in a tone that reads on the square (launcherInk, picked
 * by palette in CSS); a site image keeps its own colours. Purely visual.
 */
export function LauncherIcon({ look, className }: { look: LauncherLook; className?: string }) {
  const { icon, color, name, url } = look;
  const ink = launcherInk(color);
  const letter = <span className="ln-letter">{letterOf(name, url)}</span>;
  let inner: ReactNode;
  if (icon.kind === "fluent") inner = <FluentGlyph name={icon.name} svg={icon.svg} fallback={letter} />;
  else if (icon.kind === "site" && isImageDataUrl(icon.data)) inner = <SiteImage data={icon.data} fallback={letter} />;
  else inner = letter;
  const style = { "--ln-color": color, "--ln-ink-dark": ink.dark, "--ln-ink-light": ink.light } as CSSProperties;
  return (
    <span className={cx("ln-square", className)} style={style} aria-hidden="true">
      {inner}
    </span>
  );
}

interface CellProps {
  look: LauncherLook;
  showLabel: boolean;
  /** Given on the tile: the cell becomes a button and is tagged for the context menu. */
  onClick?: () => void;
  launcherId?: string;
  className?: string;
  /** The caption element, for the tile to tell whether its text is cut. */
  captionRef?: Ref<HTMLSpanElement>;
}

/** 64×64 launcher cell: tinted square plus an optional one-line caption. A <button> with onClick, otherwise static. */
export function LauncherCell({ look, showLabel, onClick, launcherId, className, captionRef }: CellProps) {
  const cls = cx("ln-cell", className);
  const body = (
    <>
      <LauncherIcon look={look} />
      {showLabel && (
        <span ref={captionRef} className="ln-caption caption">
          {look.caption ?? look.name}
        </span>
      )}
    </>
  );
  if (!onClick) {
    return (
      <div className={cls} role="presentation">
        {body}
      </div>
    );
  }
  return (
    <button type="button" className={cls} data-launcher={launcherId} aria-label={look.name} onClick={onClick}>
      {body}
    </button>
  );
}

interface AddCellProps {
  /** Caption under the square (when showLabel). */
  caption: string;
  showLabel: boolean;
  ariaLabel: string;
  onClick?: () => void;
}

/** «Добавить» at the end of the grid: a plus without tint. */
export function AddCell({ caption, showLabel, ariaLabel, onClick }: AddCellProps) {
  const cls = "ln-cell ln-add";
  const body = (
    <>
      <span className="ln-square" aria-hidden="true">
        <Icon name="add" />
      </span>
      {showLabel && <span className="ln-caption caption">{caption}</span>}
    </>
  );
  if (!onClick) {
    return (
      <div className={cls} role="presentation">
        {body}
      </div>
    );
  }
  return (
    <button type="button" className={cls} aria-label={ariaLabel} onClick={onClick}>
      {body}
    </button>
  );
}
