"use client";

import { useState } from "react";
import type { LinkGroup } from "@/lib/link-options";

const CUSTOM = "__custom__";

/**
 * A link field that offers the site's own pages instead of a typed path.
 *
 * The choices come from lib/link-options.ts. "Custom link…" opens a text box
 * for anything else (another website, WhatsApp, email). A saved value that is
 * not one of the choices opens in custom mode, so nothing already saved is lost.
 */
export function LinkPicker({ label, value, onChange, groups }: { label: string; value: string; onChange: (value: string) => void; groups: LinkGroup[] }) {
  const listed = groups.some(group => group.options.some(option => option.href === value));
  const [custom, setCustom] = useState(!listed && value !== "");

  return (
    <div className="admin-field link-picker">
      <label>
        <span>{label}</span>
        <select
          value={custom ? CUSTOM : value}
          onChange={event => {
            if (event.target.value === CUSTOM) {
              setCustom(true);
              return;
            }
            setCustom(false);
            onChange(event.target.value);
          }}
        >
          {!custom && !listed ? <option value="">Choose a page</option> : null}
          {groups.map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map(option => (
                <option key={option.href} value={option.href}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
          <optgroup label="Other">
            <option value={CUSTOM}>Custom link…</option>
          </optgroup>
        </select>
      </label>
      {custom ? (
        <input
          aria-label={`${label}: custom link`}
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder="https://… or mailto:…"
        />
      ) : (
        <small>{value}</small>
      )}
    </div>
  );
}
