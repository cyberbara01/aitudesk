import { useId, type KeyboardEvent, type ReactNode } from "react";

interface TextFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  /** Cascadia / JetBrains Mono (URLs, room codes). */
  mono?: boolean;
  type?: "text" | "url" | "time" | "number";
  maxLength?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  spellCheck?: boolean;
  suffix?: ReactNode;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
  inputClassName?: string;
  min?: number;
  max?: number;
  step?: number;
}

/** Fluent text field: h32, radius 6, control fill, 1 px strong bottom line; focused = 2 px accent line. */
export function TextField({
  value,
  onChange,
  label,
  placeholder,
  error,
  mono,
  type = "text",
  maxLength,
  autoFocus,
  disabled,
  spellCheck = false,
  suffix,
  onBlur,
  onKeyDown,
  className,
  inputClassName,
  min,
  max,
  step,
}: TextFieldProps) {
  const id = useId();
  const cls = ["textfield", error ? "error" : "", className ?? ""].filter(Boolean).join(" ");
  const inputCls = ["textfield-input", mono ? "mono" : "", inputClassName ?? ""].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      {label && (
        <label className="textfield-label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="textfield-wrap">
        <input
          id={id}
          className={inputCls}
          type={type}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          autoFocus={autoFocus}
          disabled={disabled}
          spellCheck={spellCheck}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          aria-invalid={Boolean(error)}
        />
        {suffix && <span className="textfield-suffix caption">{suffix}</span>}
      </div>
      {error && <span className="textfield-error">{error}</span>}
    </div>
  );
}
