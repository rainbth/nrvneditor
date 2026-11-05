import * as ContextMenu from "@radix-ui/react-context-menu";
import type { ReactNode } from "react";

/**
 * Menú contextual sobre Radix ContextMenu. Comparte la presentación (clases
 * `menu-*`) con los dropdowns y aporta apertura por clic derecho y por teclado
 * (Shift+F10 / tecla Menú).
 */

export const ContextMenuRoot = ContextMenu.Root;
export const ContextMenuTrigger = ContextMenu.Trigger;

function shortcutToAria(shortcut: string): string {
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

export interface ContextMenuContentProps {
  children: ReactNode;
  onCloseAutoFocus?: ContextMenu.ContextMenuContentProps["onCloseAutoFocus"];
}

export function ContextMenuContent({ children, onCloseAutoFocus }: ContextMenuContentProps) {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content
        className="menu-content"
        collisionPadding={8}
        data-overlay=""
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {children}
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
}

export interface ContextMenuItemProps {
  icon?: ReactNode;
  children: ReactNode;
  shortcut?: string;
  onSelect?: ContextMenu.ContextMenuItemProps["onSelect"];
  disabled?: boolean;
  tone?: "default" | "danger";
  testId?: string;
  title?: string;
}

export function ContextMenuItem({
  icon,
  children,
  shortcut,
  onSelect,
  disabled = false,
  tone = "default",
  testId,
  title,
}: ContextMenuItemProps) {
  return (
    <ContextMenu.Item
      className="menu-item"
      data-tone={tone === "danger" ? "danger" : undefined}
      data-testid={testId}
      title={title}
      disabled={disabled}
      onSelect={onSelect}
      aria-keyshortcuts={shortcut ? shortcutToAria(shortcut) : undefined}
    >
      <span className="menu-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="menu-text">{children}</span>
      {shortcut ? <span className="menu-shortcut">{shortcut}</span> : null}
    </ContextMenu.Item>
  );
}

export function ContextMenuSeparator() {
  return <ContextMenu.Separator className="menu-separator" />;
}

export function ContextMenuLabel({ children }: { children: ReactNode }) {
  return <ContextMenu.Label className="menu-label">{children}</ContextMenu.Label>;
}

export function ContextMenuPersonaItem({
  label,
  title,
  disabled,
  onSelect,
  children,
}: {
  label: string;
  title?: string;
  disabled?: boolean;
  onSelect?: ContextMenu.ContextMenuItemProps["onSelect"];
  children: ReactNode;
}) {
  return (
    <ContextMenu.Item
      className="menu-item menu-persona"
      role="menuitem"
      aria-label={label}
      title={title}
      disabled={disabled}
      onSelect={onSelect}
    >
      {children}
    </ContextMenu.Item>
  );
}
