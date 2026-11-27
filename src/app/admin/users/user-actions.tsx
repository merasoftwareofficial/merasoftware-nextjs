"use client";

/**
 * Blog role and ban controls for one user row. The API enforces who may do
 * this (admin only, never on yourself); this component only offers the controls.
 */

import { useNavigate, useTask } from "@/components/loading/navigation";
import { useState } from "react";
import { CapsuleSelect } from "@/components/capsule-select";
import type { Role } from "@/lib/repo/types";

const ROLES: Role[] = ["member", "moderator", "editor", "admin"];

export function UserActions({ id, role, banned }: { id: string; role: Role; banned: boolean }) {
  const router = useNavigate();
  const { busy, track } = useTask();
  const [error, setError] = useState("");

  const patch = (body: { role?: Role; banned?: boolean }) =>
    track(async () => {
      setError("");
      const response = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not update that user.");
        return;
      }
      router.refresh();
    });

  return (
    <span className="admin-row-actions">
      <CapsuleSelect
        ariaLabel="Blog role"
        value={role}
        disabled={busy}
        onChange={next => patch({ role: next as Role })}
        options={ROLES.map(option => ({ value: option, label: option }))}
      />

      <button
        className={banned ? "admin-action" : "admin-action is-danger"}
        type="button"
        disabled={busy}
        onClick={() => {
          // Banning signs the person out of the website at once; unbanning needs no second thought.
          if (!banned && !window.confirm("Ban this user? They are signed out of the website until you unban them.")) return;
          patch({ banned: !banned });
        }}
      >
        {banned ? "Unban" : "Ban"}
      </button>

      {error ? <span className="form-error">{error}</span> : null}
    </span>
  );
}
