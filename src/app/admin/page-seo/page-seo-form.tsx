"use client";

import { useEffect, useState } from "react";
import { useNavigate, useTask } from "@/components/loading/navigation";
import { imageSourcesFor } from "@/components/image-chooser";
import { MediaPicker } from "@/components/media-picker";
import { SeoChecklist, SeoHint, SerpPreview, focusSeoField } from "@/components/seo-checks";
import type { PageSeo, Role } from "@/lib/repo/types";
import { pageSeoChecks, resolvePageSeo, type SeoPage } from "@/lib/seo-rules";

const EMPTY: PageSeo = { title: "", description: "", imageUrl: "", imageAlt: "" };

/** One page's search details. Same field ids as the blog form, so "#seo-title" links land on the field. */
export function PageSeoForm({ page, saved, role }: { page: SeoPage; saved?: Partial<PageSeo>; role: Role }) {
  const navigation = useNavigate();
  const { busy, track } = useTask();
  const [value, setValue] = useState<PageSeo>({ ...EMPTY, ...saved });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const set = <K extends keyof PageSeo>(key: K, next: PageSeo[K]) => {
    setMessage("");
    setValue(current => ({ ...current, [key]: next }));
  };

  useEffect(() => {
    const field = window.location.hash.slice(1);
    if (field) focusSeoField(field);
  }, []);

  // The same resolution the live page uses (lib/page-seo.ts).
  const resolved = resolvePageSeo(page, value);
  const checks = pageSeoChecks(resolved);

  const save = () =>
    track(async () => {
      setError("");
      setMessage("");
      const response = await fetch("/api/page-seo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: page.key, ...value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setError(data.error ?? "Could not save.");
      setMessage("Saved. The live page uses it now.");
      navigation.refresh();
    });

  return (
    <form className="admin-form" onSubmit={event => event.preventDefault()}>
      <section className="admin-seo">
        <h2>
          {page.label} <small className="field-hint">{page.path}</small>
        </h2>
        <label className="admin-field">
          <span>SEO title</span>
          <input id="seo-title" value={value.title} maxLength={70} onChange={event => set("title", event.target.value)} placeholder={page.title} />
          <SeoHint checks={checks} field="seo-title" />
        </label>
        <label className="admin-field">
          <span>Meta description</span>
          <textarea id="seo-description" value={value.description} maxLength={180} rows={3} onChange={event => set("description", event.target.value)} placeholder={page.description} />
          <SeoHint checks={checks} field="seo-description" />
        </label>
        <SerpPreview path={page.path} title={resolved.title} description={resolved.description} />
      </section>

      <section className="admin-seo">
        <h2>Share image</h2>
        <p className="field-hint">Shown when the page is shared on WhatsApp, LinkedIn or X. Without one, an image with the page title is generated (1200 × 630 is ideal).</p>
        <div className="form-columns">
          <MediaPicker
            url={value.imageUrl}
            fromLibrary={value.imageUrl.startsWith("https://res.cloudinary.com/")}
            sources={imageSourcesFor(role, { allowUrl: true })}
            onChoose={choice =>
              setValue(current =>
                choice.kind === "library"
                  ? { ...current, imageUrl: choice.asset.url, imageAlt: current.imageAlt || choice.asset.altText.slice(0, 160) }
                  : { ...current, imageUrl: choice.url, imageAlt: choice.alt ? choice.alt.slice(0, 160) : current.imageAlt },
              )
            }
            onRemove={() => setValue(current => ({ ...current, imageUrl: "", imageAlt: "" }))}
          />
          {value.imageUrl ? (
            <label className="admin-field">
              <span>Alt text</span>
              <input id="image-alt" value={value.imageAlt} maxLength={160} onChange={event => set("imageAlt", event.target.value)} placeholder="Describe the image" />
              <SeoHint checks={checks} field="image-alt" />
            </label>
          ) : null}
        </div>
      </section>

      <details className="seo-summary" open>
        <summary>SEO checklist</summary>
        <SeoChecklist checks={checks} onFix={focusSeoField} />
      </details>

      <div className="form-actions">
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {message ? <p className="form-message" role="status">{message}</p> : null}
        <button className="admin-button" type="button" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save page SEO"}
        </button>
      </div>
    </form>
  );
}
