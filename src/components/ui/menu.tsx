import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Primitivas de menú in-app sobre Radix DropdownMenu. Radix aporta el rol
 * `menu`/`menuitem`, el foco, Escape y el cierre al seleccionar; aquí sólo se
 * aplica la presentación de nrvn.
 */

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuRadioGroup = DropdownMenu.RadioGroup;

/** Etiqueta de sección dentro de un menú (no interactiva). */
export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="menu-label">{children}</DropdownMenu.Label>;
}

/** Convierte un atajo visual (⌘S) al formato de `aria-keyshortcuts` (Meta+S). */
function ariaKeyshortcuts(shortcut: string): string {
  return shortcut
    .replace(/⌘/g, "Meta+")
    .replace(/⇧/g, "Shift+")
    .replace(/⌥/g, "Alt+")
    .replace(/⌃/g, "Control+")
    .replace(/↑/g, "ArrowUp")
    .replace(/↓/g, "ArrowDown")
    .replace(/←/g, "ArrowLeft")
    .replace(/→/g, "ArrowRight")
    .replace(/⌫/g, "Backspace")
    .replace(/⌦/g, "Delete")
    .replace(/\s+/g, "");
}

export interface MenuContentProps {
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  onCloseAutoFocus?: DropdownMenu.DropdownMenuContentProps["onCloseAutoFocus"];
}

export function MenuContent({
  children,
  align = "start",
  side = "bottom",
  className,
  onCloseAutoFocus,
}: MenuContentProps) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        className={["menu-content", className].filter(Boolean).join(" ")}
        sideOffset={6}
        align={align}
        side={side}
        collisionPadding={8}
        data-overlay=""
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export interface MenuItemProps {
  icon?: ReactNode;
  children: ReactNode;
  shortcut?: string;
  onSelect?: DropdownMenu.DropdownMenuItemProps["onSelect"];
  disabled?: boolean;
  tone?: "default" | "danger";
}

export function MenuItem({
  icon,
  children,
  shortcut,
  onSelect,
  disabled = false,
  tone = "default",
}: MenuItemProps) {
  return (
    <DropdownMenu.Item
      className="menu-item"
      data-tone={tone === "danger" ? "danger" : undefined}
      disabled={disabled}
      onSelect={onSelect}
      aria-keyshortcuts={shortcut ? ariaKeyshortcuts(shortcut) : undefined}
    >
      <span className="menu-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="menu-text">{children}</span>
      {shortcut ? <span className="menu-shortcut">{shortcut}</span> : null}
    </DropdownMenu.Item>
  );
}

export interface MenuRadioItemProps {
  value: string;
  children: ReactNode;
  shortcut?: string;
  disabled?: boolean;
}

export function MenuRadioItem({ value, children, shortcut, disabled = false }: MenuRadioItemProps) {
  return (
    <DropdownMenu.RadioItem
      className="menu-item menu-radio-item"
      value={value}
      disabled={disabled}
      aria-keyshortcuts={shortcut ? ariaKeyshortcuts(shortcut) : undefined}
    >
      <span className="menu-icon" aria-hidden="true">
        <DropdownMenu.ItemIndicator>
          <Check size={14} />
        </DropdownMenu.ItemIndicator>
      </span>
      <span className="menu-text">{children}</span>
      {shortcut ? <span className="menu-shortcut">{shortcut}</span> : null}
    </DropdownMenu.RadioItem>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="menu-separator" />;
}

export interface MenuCheckboxItemProps {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  children: ReactNode;
  shortcut?: string;
}

export function MenuCheckboxItem({
  checked,
  onCheckedChange,
  children,
  shortcut,
}: MenuCheckboxItemProps) {
  return (
    <DropdownMenu.CheckboxItem
      className="menu-item menu-checkbox-item"
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-keyshortcuts={shortcut ? ariaKeyshortcuts(shortcut) : undefined}
    >
      <span className="menu-icon" aria-hidden="true">
        <DropdownMenu.ItemIndicator>
          <Check size={14} />
        </DropdownMenu.ItemIndicator>
      </span>
      <span className="menu-text">{children}</span>
      {shortcut ? <span className="menu-shortcut">{shortcut}</span> : null}
    </DropdownMenu.CheckboxItem>
  );
}
