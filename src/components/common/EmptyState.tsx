import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

/** Estado vacío reutilizable: icono, título, descripción y acción opcional. */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon ? (
        <span className="empty-state-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <p className="empty-state-title">{title}</p>
      {description ? <p className="empty-state-description">{description}</p> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}
