"use client";

/**
 * The member submission form for community articles and discussions.
 *
 * Deliberately separate from admin/blog/blog-form.tsx: that form is editorial
 * and carries slug, canonical, visibility, schedule and publish controls, none
 * of which a member may set. Both share the Tiptap editor, /api/blogs and the
 * status route, so the rules stay in one place — only the shell differs.
 *
 * A member can only save a draft or submit for review. BLOG.md: members never
 * publish directly; a submission lands as pending + noIndex and becomes public
 * only when a moderator approves it.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { emptyDoc, isEmptyDoc } from "@/components/editor/extensions";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
import type { Blog } from "@/lib/repo/types";

/** The topics a member may file a post under. */
const TOPICS = ["SEO", "Website development", "Google Ads", "Digital marketing", "Business growth"];

/**
 * A member never edits the URL, but blogInputSchema validates the slug before
 * the route slugifies it — so the title has to arrive already in slug shape.
 */
function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const COPY: Record<"community" | "discussion", { label: string; titleHint: string; bodyHint: string }> = {
  community: {
    label: "COMMUNITY ARTICLE",
    titleHint: "Write a clear, useful title",
    bodyHint: "Share original, practical knowledge with the community…",
  },
  discussion: {
    label: "DISCUSSION",
    titleHint: "Ask a clear, specific question",
    bodyHint: "Give enough detail that someone can actually answer…",
  },
};

export function CommunityForm({ blog, type: initialType }: { blog?: Blog; type: "community" | "discussion" }) {
  const router = useRouter();

  // Type is fixed once a post exists — changing it would move it between listings.
  const [type, setType] = useState<"community" | "discussion">((blog?.type as "community" | "discussion") ?? initialType);
  const [title, setTitle] = useState(blog?.title ?? "");
  const [excerpt, setExcerpt] = useState(blog?.excerpt ?? "");
  const [category, setCategory] = useState(blog?.category ?? TOPICS[0]);
  const [tags, setTags] = useState(blog?.tags.join(", ") ?? "");
  const [content, setContent] = useState<unknown>(blog?.content ?? emptyDoc);

  const [postId, setPostId] = useState(blog?._id ?? "");
  const [status, setStatus] = useState(blog?.status ?? "draft");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const copy = COPY[type];

  /**
   * Creates or updates the post. The server decides the slug, forces a member's
   * type to community/discussion and sets noIndex — nothing here is trusted.
   */
  async function persist(): Promise<string | null> {
    setError("");

    if (title.trim().length < 8) {
      setError("The title needs at least 8 characters.");
      return null;
    }
    if (excerpt.trim().length < 20) {
      setError("The short summary needs at least 20 characters.");
      return null;
    }
    if (isEmptyDoc(content)) {
      setError("The post is empty — write something before saving.");
      return null;
    }
    // The URL is built from the title, so it must contain usable characters.
    if (!blog && !slugify(title)) {
      setError("The title needs some letters or numbers.");
      return null;
    }

    const response = await fetch(postId ? `/api/blogs/${postId}` : "/api/blogs", {
      method: postId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        // Derived from the title — a member never edits the URL by hand. An
        // existing post keeps its slug so published links never break.
        slug: blog?.slug ?? slugify(title),
        excerpt: excerpt.trim(),
        content,
        type,
        category,
        tags: tags.split(",").map(tag => tag.trim()).filter(Boolean),
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Could not save the post.");
      return null;
    }

    setPostId(data._id);
    return data._id;
  }

  async function run(action: "save-draft" | "submit") {
    setBusy(true);
    setMessage("");

    const id = await persist();
    if (!id) {
      setBusy(false);
      return;
    }

    const response = await fetch(`/api/blogs/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await response.json();

    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? "Could not update the post.");
      return;
    }

    setStatus(data.status);
    if (action === "submit") {
      setDone(true);
      return;
    }

    setMessage("Draft saved. You can finish it later and submit it for review.");
    router.refresh();
  }

  if (done) {
    return (
      <section className="submission-result">
        <span>✓</span>
        <h2>Submitted for review</h2>
        <p>
          Your post is now <b>pending review</b>. A moderator will approve it, reject it or ask for changes. It stays
          out of search engines until it is approved.
        </p>
        <div className="editor-actions" style={{ justifyContent: "center" }}>
          <Link className="admin-button secondary" href="/admin/blog">
            See my posts
          </Link>
          <Link className="admin-button" href={`/community/write?type=${type}`} onClick={() => setDone(false)}>
            Write another <span>→</span>
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form className="community-editor" onSubmit={event => event.preventDefault()}>
      <div className="editor-toolbar">
        <b>{blog ? `EDITING ${copy.label}` : `NEW ${copy.label}`}</b>
        <span>Status: {status}</span>
      </div>

      {blog?.reviewNote ? (
        <div className="editor-note review-note">
          <b>Moderator note:</b> {blog.reviewNote}
        </div>
      ) : null}

      {/* Type is only choosable while creating — an existing post keeps its listing. */}
      {blog ? null : (
        <label>
          Post type
          <select value={type} onChange={event => setType(event.target.value as "community" | "discussion")}>
            <option value="community">Community article — practical, shareable knowledge</option>
            <option value="discussion">Discussion — a question for other members</option>
          </select>
        </label>
      )}

      <label>
        Title
        <input value={title} onChange={event => setTitle(event.target.value)} placeholder={copy.titleHint} />
      </label>

      <label>
        Topic
        <select value={category} onChange={event => setCategory(event.target.value)}>
          {TOPICS.map(topic => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </select>
      </label>

      <label>
        Short summary
        <textarea
          value={excerpt}
          onChange={event => setExcerpt(event.target.value)}
          rows={3}
          placeholder="One or two lines describing what this post is about."
        />
      </label>

      <label>
        Tags (comma separated, optional)
        <input value={tags} onChange={event => setTags(event.target.value)} placeholder="local seo, google maps" />
      </label>

      <div style={{ marginTop: 18 }}>
        <label style={{ marginBottom: 0 }}>Content</label>
        <div className="community-editor-body">
          <TiptapEditor value={content} onChange={setContent} placeholder={copy.bodyHint} />
        </div>
      </div>

      <div className="editor-note">
        Posts are reviewed before they go public. Write original, useful content — spam, copied text and
        backlink-only posts are rejected. Links you add are marked <code>ugc</code> so they pass no ranking value.
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-message">{message}</p> : null}

      <div className="editor-actions">
        <button className="admin-button secondary" type="button" onClick={() => run("save-draft")} disabled={busy}>
          Save draft
        </button>
        <button className="admin-button" type="button" onClick={() => run("submit")} disabled={busy}>
          {busy ? "Working…" : "Submit for review →"}
        </button>
      </div>
    </form>
  );
}
