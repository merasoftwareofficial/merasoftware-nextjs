"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Mode = "signin" | "signup";

type PortalReply = { success?: boolean; message?: string; data?: { mustResetPassword?: boolean } };

/**
 * One account for the website and the client portal: both forms talk to the
 * portal, which sets the shared `token` cookie (src/docs/login.md).
 */
export function LoginForm({ next, portalApiUrl, portalUrl }: { next: string; portalApiUrl: string; portalUrl: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function callPortal(path: string, body: Record<string, string>): Promise<PortalReply> {
    const response = await fetch(`${portalApiUrl}/api/${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.json();
  }

  function goOn(reply: PortalReply) {
    // Accounts created from a lead share a starting password; the portal owns that reset page.
    if (reply.data?.mustResetPassword) {
      window.location.href = new URL("/set-new-password", portalUrl).toString();
      return;
    }
    if (next.startsWith("/")) {
      router.push(next);
      router.refresh();
    } else {
      window.location.href = next;
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      if (mode === "signup") {
        const created = await callPortal("signup", { name: name.trim(), email: email.trim(), password });
        if (!created.success) throw new Error(created.message || "Could not create the account.");
      }
      const signedIn = await callPortal("signin", { email: email.trim(), password });
      if (!signedIn.success) throw new Error(signedIn.message || "Sign in failed.");
      goOn(signedIn);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not reach the sign-in service. Try again.");
      setBusy(false);
    }
  }

  function switchTo(value: Mode) {
    setMode(value);
    setError("");
  }

  const signup = mode === "signup";

  return (
    <form className="auth-card" onSubmit={submit}>
      <p className="eyebrow">
        <i /> {signup ? "CREATE ACCOUNT" : "SIGN IN"}
      </p>
      <h1>{signup ? "Create your account" : "Sign in to continue"}</h1>
      <p className="auth-lead">
        One account for the blog, the community and your client portal.
      </p>

      {signup ? (
        <label className="auth-field">
          <span>Your name</span>
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Shown on your posts and comments"
            required
            autoComplete="name"
          />
        </label>
      ) : null}

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
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          required
          minLength={signup ? 6 : undefined}
          autoComplete={signup ? "new-password" : "current-password"}
        />
      </label>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      <button className="admin-button auth-submit" type="submit" disabled={busy}>
        {busy ? (signup ? "Creating account…" : "Signing in…") : signup ? "Create account →" : "Sign in →"}
      </button>

      <p className="auth-switch">
        {signup ? "Already have an account? " : "New here? "}
        <button type="button" onClick={() => switchTo(signup ? "signin" : "signup")}>
          {signup ? "Sign in" : "Create an account"}
        </button>
      </p>
    </form>
  );
}
