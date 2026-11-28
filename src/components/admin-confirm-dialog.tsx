"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * SSOT Trash Icon Delete Button for Mera Software Control Panel.
 * Matches Automated Message System & Add-ons reference: solid #dc2626 with white 15x15 trash icon.
 */
export function DeleteIconButton({
  onClick,
  disabled = false,
  title = "Delete",
  ariaLabel,
  className = "",
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`admin-delete-icon-btn ${className}`.trim()}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel ?? title}
      onClick={onClick}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      </svg>
    </button>
  );
}

/**
 * SSOT Solid Red Danger Button for labeled delete/remove actions.
 */
export function DangerButton({
  onClick,
  disabled = false,
  children,
  title,
  ariaLabel,
  type = "button",
  className = "",
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  title?: string;
  ariaLabel?: string;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      className={`admin-danger-btn ${className}`.trim()}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export type ConfirmDialogProps = {
  open?: boolean;
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  busyLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  dangerTitle?: boolean;
  busy?: boolean;
  error?: string;
  infoContent?: ReactNode;
  zIndex?: number;
  alertOnly?: boolean;
  extraActions?: ReactNode;
  onCancel: () => void;
  onConfirm?: () => void | Promise<void>;
};

/**
 * SSOT Compact Confirmation / Delete Pop-up for Mera Software Control Panel.
 * Portal-rendered to document.body with Escape handling, backdrop blur, and optional info toggle.
 */
export function ConfirmDialog({
  open = true,
  title,
  message,
  confirmLabel = "Delete permanently",
  busyLabel = "Deleting…",
  cancelLabel = "Cancel",
  variant = "danger",
  dangerTitle = false,
  busy = false,
  error = "",
  infoContent,
  zIndex = 250,
  alertOnly = false,
  extraActions,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const titleId = useId();
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, busy, onCancel]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="admin-confirm-overlay"
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="admin-confirm-backdrop"
        onClick={() => { if (!busy) onCancel(); }}
      />
      <div
        className="admin-confirm-card"
        onClick={event => event.stopPropagation()}
      >
        <div className="admin-confirm-body">
          <div className="admin-confirm-head">
            <div className="admin-confirm-title-wrap">
              <strong
                id={titleId}
                style={{ fontSize: 16, color: dangerTitle ? "#dc2626" : "var(--pn-text)" }}
              >
                {title}
              </strong>
              {infoContent ? (
                <button
                  type="button"
                  aria-label="More info about these options"
                  title="What do these options do?"
                  onClick={() => setShowInfo(v => !v)}
                  className="admin-confirm-info-btn"
                  data-open={showInfo ? "true" : "false"}
                >
                  i
                </button>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Close"
              title="Close"
              disabled={busy}
              onClick={onCancel}
              className="admin-dialog-close-btn"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="admin-confirm-message">{message}</div>

          {showInfo && infoContent ? (
            <div className="admin-confirm-info-box">{infoContent}</div>
          ) : null}

          {error ? <p className="form-error" role="alert" style={{ margin: 0 }}>{error}</p> : null}

          <div className="admin-confirm-actions">
            {extraActions}
            {!alertOnly ? (
              <button
                type="button"
                className="admin-dialog-btn"
                disabled={busy}
                onClick={onCancel}
              >
                {cancelLabel}
              </button>
            ) : null}
            {onConfirm ? (
              <button
                type="button"
                className={variant === "danger" ? "admin-danger-btn" : "admin-dialog-primary-btn"}
                disabled={busy}
                onClick={() => void onConfirm()}
              >
                {busy ? busyLabel : confirmLabel}
              </button>
            ) : alertOnly ? (
              <button
                type="button"
                className="admin-dialog-primary-btn"
                disabled={busy}
                onClick={onCancel}
              >
                OK
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export type ConfirmOptions = {
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  dangerTitle?: boolean;
  alertOnly?: boolean;
};

/**
 * Imperative hook for async confirmation flows (replaces native window.confirm / window.alert).
 * Usage: const { confirm, dialog } = useConfirmDialog();
 */
export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setState(null);
    resolve?.(value);
  }, []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
    setState(options);
    return new Promise<boolean>(resolve => {
      resolverRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    return () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    };
  }, []);

  const dialog = state ? (
    <ConfirmDialog
      open
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel ?? (state.variant === "primary" ? "Confirm" : "Delete permanently")}
      cancelLabel={state.cancelLabel ?? "Cancel"}
      variant={state.variant ?? "danger"}
      dangerTitle={state.dangerTitle}
      alertOnly={state.alertOnly}
      onCancel={() => settle(false)}
      onConfirm={state.alertOnly ? undefined : () => settle(true)}
    />
  ) : null;

  return { confirm, dialog };
}
