import { useEffect, useId, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

interface TextAreaProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  /** Accessible name when there is no visible label. */
  ariaLabel?: string;
  placeholder?: string;
  /** Hard limit (UTF-16 units, like String.length); a counter appears close to it. */
  maxLength?: number;
  /** Autosize range in text rows (default 3 to 8); past maxRows the field scrolls. */
  minRows?: number;
  maxRows?: number;
  /** Focus on mount with the caret after the text. */
  autoFocus?: boolean;
  disabled?: boolean;
  spellCheck?: boolean;
  error?: string;
  /** Caption under the field, on the left (e.g. a keyboard hint). */
  hint?: ReactNode;
  /** The counter shows from this share of maxLength (default 0.9). */
  counterFrom?: number;
  /** Counter wording; default «1850 / 2000». */
  counterText?: (length: number, max: number) => string;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onBlur?: () => void;
  className?: string;
  inputClassName?: string;
}

/** Content-sized textareas natively (Chromium 123+); older engines get the measured fallback below. */
const NATIVE_AUTOSIZE = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content");

/** The nearest ancestor that scrolls vertically (its position is kept while the field is measured). */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/**
 * Multi-line text field in the kit's look (TextField: control fill, strong bottom line, accent underline in
 * focus; the Aqua and Rice variants come with the shared `textfield-input` class). Grows with its content
 * from `minRows` to `maxRows`, then scrolls. Near `maxLength` a counter appears under the field.
 */
export function TextArea({
  value,
  onChange,
  label,
  ariaLabel,
  placeholder,
  maxLength,
  minRows = 3,
  maxRows = 8,
  autoFocus,
  disabled,
  spellCheck = true,
  error,
  hint,
  counterFrom = 0.9,
  counterText,
  onKeyDown,
  onBlur,
  className,
  inputClassName,
}: TextAreaProps) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);

  // Fallback autosize: collapse to the minimum, read the content height, clamp. The scrolling ancestor
  // (dialog body) keeps its position, so a shrinking field never makes the sheet jump.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || NATIVE_AUTOSIZE) return;
    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 20;
    const chrome =
      parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const min = minRows * line + chrome;
    const max = maxRows * line + chrome;
    const scroller = scrollParent(el);
    const keep = scroller?.scrollTop ?? 0;
    el.style.height = `${min}px`;
    const content = el.scrollHeight + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = `${Math.min(max, Math.max(min, content))}px`;
    el.style.overflowY = content > max ? "auto" : "hidden";
    if (scroller) scroller.scrollTop = keep;
  }, [value, minRows, maxRows]);

  // One frame after mount: a surrounding Dialog has recorded what to refocus on close and done its own
  // initial focus by then; the caret goes after the text.
  useEffect(() => {
    if (!autoFocus) return;
    const frame = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      if (document.activeElement !== el) el.focus({ preventScroll: true });
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
    return () => cancelAnimationFrame(frame);
    // Once, on mount.
  }, []);

  const showCounter = maxLength !== undefined && value.length >= Math.floor(maxLength * counterFrom);
  const atLimit = maxLength !== undefined && value.length >= maxLength;
  const counterId = `${id}-counter`;
  const cls = ["textfield", "textarea", error ? "error" : "", className ?? ""].filter(Boolean).join(" ");
  const inputCls = ["textfield-input", "textarea-input", inputClassName ?? ""].filter(Boolean).join(" ");
  const style = { "--ta-min-rows": minRows, "--ta-max-rows": maxRows } as CSSProperties;

  return (
    <div className={cls}>
      {label && (
        <label className="textfield-label" htmlFor={id}>
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={id}
        className={inputCls}
        style={style}
        rows={minRows}
        tabIndex={0}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        spellCheck={spellCheck}
        aria-label={label ? undefined : ariaLabel}
        aria-invalid={Boolean(error)}
        aria-describedby={showCounter ? counterId : undefined}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      />
      {error && <span className="textfield-error">{error}</span>}
      {(hint || showCounter) && (
        <div className="textarea-foot">
          <span className="textarea-hint">{hint}</span>
          {showCounter && maxLength !== undefined && (
            <span id={counterId} className={atLimit ? "textarea-counter limit" : "textarea-counter"}>
              {counterText ? counterText(value.length, maxLength) : `${value.length} / ${maxLength}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
