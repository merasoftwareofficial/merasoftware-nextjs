"use client";
import { useState, type InputHTMLAttributes } from "react";

const formatNumber = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value) ? "" : String(value);

export type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: number | null | undefined;
  onValueChange: (value: number) => void;
  /** Called when the user clears the input to empty. Use on noValidate forms that validate empty state explicitly. */
  onEmpty?: () => void;
  /** Behavior on blur if left empty: "keep" (default when required or onEmpty is set), "revert" (default otherwise), or "zero". */
  emptyOnBlur?: "keep" | "revert" | "zero";
};

/**
 * Controlled numeric input that never traps a stuck "0" when the user backspaces/deletes.
 * Maintains raw text while editing, syncs cleanly on external value changes (using Object.is
 * so NaN never loops), and emits only finite numbers to onValueChange.
 */
export function NumberInput({ value, onValueChange, onEmpty, emptyOnBlur, onBlur, ...rest }: NumberInputProps) {
  const [state, setState] = useState<{ synced: number | null | undefined; text: string }>(() => ({
    synced: value,
    text: formatNumber(value),
  }));
  if (!Object.is(state.synced, value)) {
    setState({ synced: value, text: formatNumber(value) });
  }

  const resolvedEmptyBlur = emptyOnBlur ?? (rest.required || onEmpty ? "keep" : "revert");

  return (
    <input
      {...rest}
      type="number"
      value={state.text}
      onChange={event => {
        const raw = event.target.value;
        if (raw.trim() === "") {
          setState({ synced: onEmpty ? Number.NaN : state.synced, text: "" });
          onEmpty?.();
          return;
        }
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) {
          setState({ synced: parsed, text: raw });
          onValueChange(parsed);
        } else {
          setState({ synced: state.synced, text: raw });
        }
      }}
      onBlur={event => {
        if (state.text.trim() === "") {
          if (resolvedEmptyBlur === "zero") {
            setState({ synced: 0, text: "0" });
            onValueChange(0);
          } else if (resolvedEmptyBlur === "revert") {
            setState({ synced: value, text: formatNumber(value) });
          }
        }
        onBlur?.(event);
      }}
    />
  );
}
