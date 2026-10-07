import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "accent" | "subtle" | "danger";
  size?: "md" | "sm";
  /** Fluent icon name (20 px, or 16 px for size sm). */
  icon?: string;
  children?: ReactNode;
}

export function Button({ variant = "default", size = "md", icon, className, children, type = "button", ...rest }: ButtonProps) {
  const cls = ["btn", variant !== "default" ? variant : "", size === "sm" ? "sm" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <button type={type} className={cls} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 16 : 20} />}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  label: string;
  /** "danger": quiet like subtle, turns critical on hover (delete actions in lists). */
  variant?: "default" | "subtle" | "danger";
  selected?: boolean;
  filled?: boolean;
}

export function IconButton({ icon, label, variant = "default", selected, filled, className, type = "button", ...rest }: IconButtonProps) {
  const cls = ["icon-btn", variant !== "default" ? variant : "", selected ? "selected" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <button type={type} className={cls} aria-label={label} title={undefined} {...rest}>
      <Icon name={icon} variant={filled || selected ? "filled" : "regular"} />
    </button>
  );
}
