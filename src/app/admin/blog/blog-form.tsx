"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { emptyDoc, isEmptyDoc } from "@/components/editor/extensions";
import type { Blog, BlogType, CommentMode, Role, ViewMode, Visibility } from "@/lib/repo/types";

type Draft = {
  title: string;
  slug: string;
  slugTouched: boolean;
  excerpt: string;
  content: unknown;
  category: string;
  tags: string;
  imageUrl: string;
  imageAlt: string;
  seoTitle: string;
  seoDescription: string;
  canonical: string;
  visibility: Visibility;
  comments: CommentMode;
  showViews: ViewMode;
  scheduledFor: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function draftFrom(blog?: Blog): Draft {
  return {
    title: blog?.title ?? "",
    slug: blog?.slug ?? "",
    slugTouched: !!blog,
    excerpt: blog?.excerpt ?? "",
    content: blog?.content ?? emptyDoc,
    category: blog?.category ?? "",
    tags: blog?.tags.join(", ") ?? "",
    imageUrl: blog?.featuredImage?.url ?? "",
    imageAlt: blog?.featuredImage?.alt ?? "",
    seoTitle: blog?.seo?.title ?? "",
    seoDescription: blog?.seo?.description ?? "",
    canonical: blog?.seo?.canonical ?? "",
    visibility: blog?.visibility ?? "public",
    comments: blog?.comments ?? "default",
    showViews: blog?.showViews ?? "default",
    scheduledFor: blog?.scheduledFor?.slice(0, 16) ?? "",
  };
}

export function BlogForm({
  blog,
  type = "official",
  role,
}: {
  blog?: Blog;
  type?: BlogType;
  role: Role;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(blog));
  const [slugFree, setSlugFree] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [postId, setPostId] = useState(blog?._id ?? "");
  const [status, setStatus] = useState(blog?.status ?? "draft");

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft(current => ({ ...current, [key]: value }));

  // Slug follows the title until the author edits it by hand.
  useEffect(() => {
    if (!draft.slugTouched) setDraft(current => ({ ...current, slug: slugify(current.title) }));
  }, [draft.title, draft.slugTouched]);

  // Live availability check, debounced so typing does not spam the API.
  useEffect(() => {
    if (!draft.slug) {
      setSlugFree(null);
      return;
    }
    const timer = setTimeout(async () => {
      const query = new URLSearchParams({ slug: draft.slug });
      if (postId) query.set("id", postId);
      const response = await fetch(`/api/slug-check?${query}`);
      if (response.ok) setSlugFree((await response.json()).available);
    }, 400);
    return () => clearTimeout(timer);
  }, [draft.slug, postId]);

  const canPublish = role === "editor" || role === "admin";

  function body() {
    return {
      title: draft.title,
      slug: draft.slug,
      excerpt: draft.excerpt,
      content: draft.content,
      type,
      visibility: draft.visibility,
      // Only an editor sees the control; anyone else leaves the post on the
      // site default, which is what the API would force anyway.
      comments: draft.comments,
      showViews: draft.showViews,
      category: draft.category || undefined,
      tags: draft.tags.split(",").map(tag => tag.trim()).filter(Boolean),
      featuredImage: draft.imageUrl ? { url: draft.imageUrl, publicId: "", alt: draft.imageAlt } : undefined,
      seo: { title: draft.seoTitle, description: draft.seoDescription, canonical: draft.canonical },
    };
  }

  /** Creates the post if new, otherwise saves the edits. Returns the id. */
  async function persist(): Promise<string | null> {
    setError("");

    if (isEmptyDoc(draft.content)) {
      setError("The article content is empty.");
      return null;
    }
    if (slugFree === false) {
      setError("That URL slug is already used by another post.");
      return null;
    }

    const response = await fetch(postId ? `/api/blogs/${postId}` : "/api/blogs", {
      method: postId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body()),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Could not save the post.");
      return null;
    }

    setPostId(data._id);
    return data._id;
  }

  async function runAction(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setMessage("");

    const id = await persist();
    if (!id) {
      setBusy(false);
      return;
    }

    if (action === "save-draft") {
      setMessage("Draft saved.");
      setBusy(false);
      router.refresh();
      if (!blog) router.replace(`/admin/blog/${draft.slug}/edit`);
      return;
    }

    const response = await fetch(`/api/blogs/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await response.json();

    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? "Could not update the post.");
      return;
    }

    setStatus(data.status);
    setMessage(
      action === "publish"
        ? "Published. It is now live on the blog."
        : action === "schedule"
          ? "Scheduled."
          : action === "submit"
            ? "Submitted for review."
            : "Updated.",
    );
    router.refresh();
    if (!blog) router.replace(`/admin/blog/${draft.slug}/edit`);
  }

  async function remove() {
    if (!postId || !window.confirm("Delete this post permanently?")) return;
    setBusy(true);
    const response = await fetch(`/api/blogs/${postId}`, { method: "DELETE" });
    setBusy(false);
    if (response.ok) router.push("/admin/blog");
    else setError((await response.json()).error ?? "Could not delete the post.");
  }

  return (
    <form className="admin-form" onSubmit={event => event.preventDefault()}>
      <div className="form-columns">
        <label className="admin-field">
          <span>Article title</span>
          <input
            value={draft.title}
            onChange={event => set("title", event.target.value)}
            placeholder="Enter a useful, clear title"
          />
        </label>
        <label className="admin-field">
          <span>
            URL slug
            {slugFree === false ? <em className="slug-taken"> — already used</em> : null}
            {slugFree === true ? <em className="slug-free"> — available</em> : null}
          </span>
          <input
            value={draft.slug}
            onChange={event => {
              set("slugTouched", true);
              set("slug", event.target.value);
            }}
            placeholder="article-url-slug"
          />
        </label>
      </div>

      <div className="form-columns">
        <label className="admin-field">
          <span>Category</span>
          <input value={draft.category} onChange={event => set("category", event.target.value)} placeholder="e.g. SEO" />
        </label>
        <label className="admin-field">
          <span>Tags (comma separated)</span>
          <input value={draft.tags} onChange={event => set("tags", event.target.value)} placeholder="seo, local search" />
        </label>
      </div>

      <label className="admin-field">
        <span>Short description</span>
        <textarea
          value={draft.excerpt}
          onChange={event => set("excerpt", event.target.value)}
          rows={3}
          placeholder="A concise article summary for readers and search."
        />
      </label>

      <div className="admin-field">
        <span>Article content</span>
        <TiptapEditor value={draft.content} onChange={content => set("content", content)} />
      </div>

      <section className="admin-seo">
        <h2>Featured image</h2>
        <div className="form-columns">
          <label className="admin-field">
            <span>Image URL</span>
            <input
              value={draft.imageUrl}
              onChange={event => set("imageUrl", event.target.value)}
              placeholder="https://… (Cloudinary upload comes later)"
            />
          </label>
          <label className="admin-field">
            <span>Alt text</span>
            <input value={draft.imageAlt} onChange={event => set("imageAlt", event.target.value)} placeholder="Describe the image" />
          </label>
        </div>
      </section>

      <section className="admin-seo">
        <h2>SEO &amp; visibility</h2>
        <div className="form-columns">
          <label className="admin-field">
            <span>SEO title</span>
            <input value={draft.seoTitle} onChange={event => set("seoTitle", event.target.value)} placeholder="Page title for Google" />
          </label>
          <label className="admin-field">
            <span>Visibility</span>
            <select value={draft.visibility} onChange={event => set("visibility", event.target.value as Visibility)}>
              <option value="public">Public — anyone can read</option>
              <option value="members">Members only — login required</option>
              <option value="unlisted">Unlisted — direct link only</option>
              <option value="private">Private — author and admin</option>
            </select>
          </label>
        </div>
        <label className="admin-field">
          <span>Meta description</span>
          <textarea
            value={draft.seoDescription}
            onChange={event => set("seoDescription", event.target.value)}
            rows={2}
            placeholder="Search result summary"
          />
        </label>
        <label className="admin-field">
          <span>Canonical URL (optional)</span>
          <input value={draft.canonical} onChange={event => set("canonical", event.target.value)} placeholder="https://merasoftware.com/blog/…" />
        </label>

        {canPublish ? (
          <label className="admin-field">
            <span>Comments on this post</span>
            <select value={draft.comments} onChange={event => set("comments", event.target.value as CommentMode)}>
              <option value="default">Site default — follow the setting in Site settings</option>
              <option value="open">Open — comments appear straight away</option>
              <option value="moderated">Moderated — hold each one for review</option>
              <option value="closed">Closed — no new comments</option>
            </select>
          </label>
        ) : null}

        {canPublish ? (
          <label className="admin-field">
            <span>View count on this post</span>
            <select value={draft.showViews} onChange={event => set("showViews", event.target.value as ViewMode)}>
              <option value="default">Site default — follow the setting in Site settings</option>
              <option value="show">Show — readers see how many views it has</option>
              <option value="hide">Hide — only the panel shows its views</option>
            </select>
          </label>
        ) : null}
      </section>

      {canPublish ? (
        <section className="admin-seo">
          <h2>Schedule</h2>
          <label className="admin-field">
            <span>Publish at</span>
            <input type="datetime-local" value={draft.scheduledFor} onChange={event => set("scheduledFor", event.target.value)} />
          </label>
        </section>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-message">{message}</p> : null}

      <div className="form-actions">
        <span className={`status status-${status === "published" ? "live" : "draft"}`}>{status}</span>

        {postId ? (
          <button className="admin-button danger" type="button" onClick={remove} disabled={busy}>
            Delete
          </button>
        ) : null}

        <button className="admin-button secondary" type="button" onClick={() => runAction("save-draft")} disabled={busy}>
          Save draft
        </button>

        {canPublish ? (
          <>
            {draft.scheduledFor ? (
              <button
                className="admin-button secondary"
                type="button"
                disabled={busy}
                onClick={() => runAction("schedule", { scheduledFor: new Date(draft.scheduledFor).toISOString() })}
              >
                Schedule
              </button>
            ) : null}
            {status === "published" ? (
              <button className="admin-button secondary" type="button" onClick={() => runAction("unpublish")} disabled={busy}>
                Unpublish
              </button>
            ) : null}
            <button className="admin-button" type="button" onClick={() => runAction("publish")} disabled={busy}>
              {busy ? "Working…" : "Publish article →"}
            </button>
          </>
        ) : (
          <button className="admin-button" type="button" onClick={() => runAction("submit")} disabled={busy}>
            {busy ? "Working…" : "Submit for review →"}
          </button>
        )}
      </div>
    </form>
  );
}
