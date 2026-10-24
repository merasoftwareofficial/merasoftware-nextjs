"use client";

import { useNavigate, useTask } from "@/components/loading/navigation";
import { PhoneField, type PhoneCountry } from "@/components/phone-field";
import { useState } from "react";

const INDIA: PhoneCountry[] = [{ code: "+91", label: "India", digits: 10 }];

type Mode = "signin" | "signup";

type PortalReply = { success?: boolean; message?: string; data?: { mustResetPassword?: boolean } };

/**
 * One account for the website and the client portal: both forms talk to the
 * portal, which sets the shared `token` cookie (src/docs/login.md).
 */
export function LoginForm({ next, portalApiUrl, portalUrl, countries = INDIA }: { next: string; portalApiUrl: string; portalUrl: string; countries?: PhoneCountry[] }) {
  const router = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  // Owner rule: no account without a mobile number; the portal validates and stores it.
  const [phone, setPhone] = useState({ countryCode: countries[0].code, phone: "" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const task = useTask();
  // Stays set after a sign-in until the next page is in, so the form cannot be sent twice.
  const busy = task.busy || router.pending;

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
      const target = new URL("/set-new-password", portalUrl);
      // The portal accepts only a same-website offer/account destination on return.
      if (/^\/offer\/[a-z0-9-]+$/.test(next) || next === '/account/offers') target.searchParams.set('next', new URL(next, window.location.origin).toString());
      router.assign(target.toString());
      return;
    }
    if (next.startsWith("/")) {
      router.push(next);
      router.refresh();
    } else {
      router.assign(next);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await task.track(async () => {
      setError("");

      try {
        if (mode === "signup") {
          const created = await callPortal("signup", { name: name.trim(), email: email.trim(), password, countryCode: phone.countryCode, phone: phone.phone.trim() });
          if (!created.success) throw new Error(created.message || "Could not create the account.");
        }
        const signedIn = await callPortal("signin", { email: email.trim(), password });
        if (!signedIn.success) throw new Error(signedIn.message || "Sign in failed.");
        goOn(signedIn);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not reach the sign-in service. Try again.");
      }
    });
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

      {signup ? <PhoneField className="auth-field" countries={countries} value={phone} onChange={setPhone} /> : null}

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
