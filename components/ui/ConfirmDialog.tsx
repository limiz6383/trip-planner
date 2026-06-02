"use client";

import { useEffect, useRef } from "react";
import { Button } from "./Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** When true the confirm button renders with the danger variant */
  destructive?: boolean;
}

/**
 * Lightweight accessible confirm dialog built on the native <dialog> element.
 * No external dependencies — uses Tailwind for styling and the browser's
 * built-in focus-trap / escape-key handling via showModal().
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [open]);

  // Close on native dialog cancel (Escape key)
  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    onCancel();
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      className="m-auto w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-xl backdrop:bg-black/40 backdrop:backdrop-blur-sm open:flex open:flex-col open:gap-4"
    >
      <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
      <p className="text-sm text-zinc-500">{description}</p>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" size="sm" onClick={onCancel} type="button">
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? "danger" : "primary"}
          size="sm"
          onClick={onConfirm}
          type="button"
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
