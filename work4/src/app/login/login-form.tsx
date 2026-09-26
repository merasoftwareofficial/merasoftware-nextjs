"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/lib/repo/types";

const ROLES: { value: Role; label: string; note: string }[] = [
  { value: "member", label: "Member", note: "Write drafts and submit posts for review" },
  { value: "moderator", label: "Moderator", note: "Review the community queue and comments" },
  { value: "editor", label: "Editor", note: "Manage and publish official articles" },
  { value: "admin", label: "Admin", note: "Full access to users, content and settings" },
];

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, displayName, role }),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Sign in failed.");
      setBusy(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <p className="eyebrow">
        <i /> DEVELOPMENT SIGN IN
      </p>
      <h1>Sign in to continue</h1>
      <p className="auth-lead">
        This is a local development login. No password is checked yet — Firebase Authentication
        replaces it before launch.
      </p>

      <label className="auth-field">
        <span>Email address</span>
        <input
          type="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
        />
      </label>

      <label className="auth-field">
        <span>Display name</span>
        <input
          value={displayName}
          onChange={event => setDisplayName(event.target.value)}
          placeholder="Shown on your posts and comments"
        />
      </label>

      <fieldset className="auth-roles">
        <legend>Sign in as</legend>
        {ROLES.map(option => (
          <label key={option.value} className={role === option.value ? "role-option selected" : "role-option"}>
            <input
              type="radio"
              name="role"
              value={option.value}
              checked={role === option.value}
              onChange={() => setRole(option.value)}
            />
            <b>{option.label}</b>
            <small>{option.note}</small>
          </label>
        ))}
      </fieldset>

      {error ? <p className="auth-error">{error}</p> : null}

      <button className="admin-button auth-submit" type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in →"}
      </button>

      <p className="notice">
        The first account created on a fresh install becomes the admin. An existing account keeps its
        email and switches to the role selected here, so every flow can be checked from one browser.
      </p>
    </form>
  );
}
