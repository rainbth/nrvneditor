import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  label: string;
  children: ReactNode;
  active?: boolean;
  size?: "sm" | "md";
}

/** Botón de icono accesible: `label` es obligatorio y se usa como aria-label. */
export function IconButton({
  label,
  children,
  active = false,
  size = "md",
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  const classes = ["icon-button", `icon-button-${size}`, active ? "is-active" : "", className ?? ""]
    .filter((value) => value.length > 0)
    .join(" ");
  return (
    <button
      type={type}
      className={classes}
      aria-label={label}
      title={rest.title ?? label}
      aria-pressed={rest["aria-pressed"] ?? (active || undefined)}
      {...rest}
    >
      {children}
    </button>
  );
}
