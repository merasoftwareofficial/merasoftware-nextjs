"use client";

import { useEffect, useState } from "react";
import { useNavigate, useTask } from "@/components/loading/navigation";
import { imageSourcesFor } from "@/components/image-chooser";
import { MediaPicker } from "@/components/media-picker";
import { SeoChecklist, SeoHint, focusSeoField } from "@/components/seo-checks";
import type { OrganizationSeo, Role } from "@/lib/repo/types";
import { organizationSeoChecks } from "@/lib/seo-rules";

/** The business's logo and profile links, read by search engines as Organization data. */
export function OrganizationForm({ saved, role }: { saved?: OrganizationSeo; role: Role }) {
  const navigation = useNavigate();
  const { busy, track } = useTask();
  const [logoUrl, setLogoUrl] = useState(saved?.logoUrl ?? "");
  const [profiles, setProfiles] = useState((saved?.sameAs ?? []).join("\n"));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const sameAs = profiles.split(/\s+/).map(line => line.trim()).filter(Boolean);
  const checks = organizationSeoChecks({ logoUrl, sameAs });

  useEffect(() => {
    const field = window.location.hash.slice(1);
    if (field) focusSeoField(field);
  }, []);

  const save = () =>
    track(async () => {
      setError("");
      setMessage("");
      const response = await fetch("/api/organization-seo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl, sameAs }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setError(data.error ?? "Could not save.");
      setMessage("Saved. Search engines read it on their next visit.");
      navigation.refresh();
    });

  return (
    <form className="admin-form" onSubmit={event => event.preventDefault()}>
      <section className="admin-seo">
        <h2>Business details</h2>
        <p className="field-hint">Search engines read these on the homepage and every article to know who publishes the site.</p>
        <div id="org-logo">
          <MediaPicker
            url={logoUrl}
            fromLibrary={logoUrl.startsWith("https://res.cloudinary.com/")}
            sources={imageSourcesFor(role, { allowUrl: true })}
            onChoose={choice => {
              setMessage("");
              setLogoUrl(choice.kind === "library" ? choice.asset.url : choice.url);
            }}
            onRemove={() => setLogoUrl("")}
          />
          <SeoHint checks={checks} field="org-logo" />
        </div>
        <label className="admin-field">
          <span>Profile links (one per line)</span>
          <textarea
            id="org-same-as"
            value={profiles}
            rows={4}
            onChange={event => {
              setMessage("");
              setProfiles(event.target.value);
            }}
            placeholder={"https://www.linkedin.com/company/…\nhttps://www.instagram.com/…"}
          />
          <SeoHint checks={checks} field="org-same-as" />
        </label>
      </section>

      <details className="seo-summary" open>
        <summary>SEO checklist</summary>
        <SeoChecklist checks={checks} onFix={focusSeoField} />
      </details>

      <div className="form-actions">
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {message ? <p className="form-message" role="status">{message}</p> : null}
        <button className="admin-button" type="button" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save business details"}
        </button>
      </div>
    </form>
  );
}
