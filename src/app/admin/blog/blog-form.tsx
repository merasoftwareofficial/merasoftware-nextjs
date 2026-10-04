"use client";

import { useNavigate, useTask } from "@/components/loading/navigation";
import { useEffect, useRef, useState } from "react";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { imageSourcesFor } from "@/components/image-chooser";
import { MediaPicker } from "@/components/media-picker";
import { TagPicker } from "@/components/tag-picker";
import { emptyDoc, isEmptyDoc } from "@/components/editor/extensions";
import { CONTENTS_MIN_SECTIONS, CONTENTS_MIN_WORDS, RichContent, contentsPlan } from "@/components/editor/rich-content";
import { SeoChecklist, SeoHint, SerpPreview, focusSeoField } from "@/components/seo-checks";
import { publishingBriefWarnings } from "@/lib/content-rules";
import { blogSeoChecks, googleDescription, googleTitle, seoIssues, type SeoField } from "@/lib/seo-rules";
import { SITE_URL } from "@/lib/structured-data";
import type { Blog, BlogFaq, BlogType, CommentMode, ContentsMode, MediaAsset, Role, Settings, ShareMode, TitleSize, ViewMode, Visibility } from "@/lib/repo/types";
import styles from "./blog-preview.module.css";

type Draft = {
  title: string;
  titleSize: TitleSize;
  contents: ContentsMode;
  slug: string;
  slugTouched: boolean;
  excerpt: string;
  content: unknown;
  category: string;
  tags: string;
  imageUrl: string;
  imagePublicId: string;
  imageAlt: string;
  seoTitle: string;
  seoDescription: string;
  canonical: string;
  visibility: Visibility;
  comments: CommentMode;
  showViews: ViewMode;
  sharing: ShareMode;
  scheduledFor: string;
  faqs: BlogFaq[];
};

/** Most a post may carry (blog-rules.ts). */
const MAX_FAQS = 12;

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * A stored UTC time as a datetime-local value in the viewer's own timezone.
 * The input has no timezone, so slicing the ISO string showed UTC as if it
 * were local (5½ hours early in India) and re-saving shifted it further.
 */
function localInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function draftFrom(blog?: Blog): Draft {
  return {
    title: blog?.title ?? "",
    titleSize: blog?.titleSize ?? "large",
    contents: blog?.contents ?? "auto",
    slug: blog?.slug ?? "",
    slugTouched: !!blog,
    excerpt: blog?.excerpt ?? "",
    content: blog?.content ?? emptyDoc,
    category: blog?.category ?? "",
    tags: blog?.tags.join(", ") ?? "",
    imageUrl: blog?.featuredImage?.url ?? "",
    imagePublicId: blog?.featuredImage?.publicId ?? "",
    imageAlt: blog?.featuredImage?.alt ?? "",
    seoTitle: blog?.seo?.title ?? "",
    seoDescription: blog?.seo?.description ?? "",
    canonical: blog?.seo?.canonical ?? "",
    visibility: blog?.visibility ?? "public",
    comments: blog?.comments ?? "default",
    showViews: blog?.showViews ?? "default",
    sharing: blog?.sharing ?? "default",
    scheduledFor: localInput(blog?.scheduledFor),
    faqs: blog?.faqs ?? [],
  };
}

export function BlogForm({
  blog,
  type = "official",
  role,
  commentDefaults,
  categories: initialCategories,
  assets,
  tagSuggestions,
}: {
  blog?: Blog;
  type?: BlogType;
  role: Role;
  commentDefaults: Pick<Settings, "commentsEnabled" | "commentDefault">;
  /** The category names this post may be filed under (categoryChoices in category-rules.ts). */
  categories: string[];
  /** The Media Library, to tell a library default alt text from the writer's own. */
  assets: MediaAsset[];
  /** Tags already in use, most-used first (lib/tag-options.ts). */
  tagSuggestions: { name: string; uses: number }[];
}) {
  const router = useNavigate();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(blog));
  const [slugFree, setSlugFree] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { busy, track } = useTask();
  const [postId, setPostId] = useState(blog?._id ?? "");
  const [status, setStatus] = useState(blog?.status ?? "draft");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<{ action: string; extra: Record<string, unknown> } | null>(null);
  const previewDialog = useRef<HTMLDivElement>(null);
  /** A field to jump to once the preview has closed (its "Fix" buttons). */
  const fixAfterClose = useRef<SeoField | null>(null);
  // Only an admin adds to the category list (owner decision); the route checks it too.
  const canAddCategory = role === "admin";
  const [categories, setCategories] = useState(initialCategories);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState("");
  // Articles may use all three image sources the role allows (an outside URL included).
  const imageSources = imageSourcesFor(role, { allowUrl: true });
  // Grows with images uploaded from the chooser, so their default alt text is recognised too.
  const [knownAssets, setKnownAssets] = useState(assets);

  const addCategory = () =>
    track(async () => {
      setCategoryError("");
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategory ?? "", membersCanUse: false }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setCategoryError(data.error ?? "Could not add the category.");
      setCategories(current => [...current, data.name].sort((a, b) => a.localeCompare(b)));
      set("category", data.name);
      setNewCategory(null);
    });

  /** Opens the preview; with an action, it is the confirm step for that action. */
  function openPreview(action: { action: string; extra: Record<string, unknown> } | null) {
    setError("");
    setReviewAction(action);
    setPreviewOpen(true);
  }

  function closePreview() {
    setPreviewOpen(false);
    setReviewAction(null);
  }

  // The preview covers the form: the page behind stops scrolling, focus moves
  // into it, and on close focus goes back to the button that opened it.
  useEffect(() => {
    if (!previewOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    previewDialog.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      root.style.overflow = overflow;
      const field = fixAfterClose.current;
      fixAfterClose.current = null;
      if (field) focusSeoField(field);
      else opener?.focus();
    };
  }, [previewOpen]);

  // A "Fix →" link from the review queue or /admin/seo ends in #<field>.
  useEffect(() => {
    const field = window.location.hash.slice(1);
    if (!field) return;
    // The article editor mounts a moment after the form.
    const timer = window.setTimeout(() => focusSeoField(field as SeoField), 300);
    return () => window.clearTimeout(timer);
  }, []);

  /** A "Fix →" in the preview: close it, then go to the field. */
  function fixFromPreview(field: SeoField) {
    fixAfterClose.current = field;
    closePreview();
  }

  /** Escape closes the preview; Tab stays inside it, as in any dialog. */
  function previewKeys(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!busy) closePreview();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), summary, a[href]")];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setReviewAction(null);
    setDraft(current => ({
      ...current,
      [key]: value,
      ...(key === "title" && !current.slugTouched ? { slug: slugify(String(value)) } : {}),
    }));
  };

  // Live availability check, debounced so typing does not spam the API.
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      if (!draft.slug) { setSlugFree(null); return; }
      const query = new URLSearchParams({ slug: draft.slug });
      if (postId) query.set("id", postId);
      try {
        const response = await fetch(`/api/slug-check?${query}`);
        const data = response.ok ? await response.json() : null;
        if (active) setSlugFree(data?.available ?? null);
      } catch { if (active) setSlugFree(null); }
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [draft.slug, postId]);

  const canPublish = role === "editor" || role === "admin";
  const briefWarnings = publishingBriefWarnings(draft.content);
  const seoInput = {
    title: draft.title,
    seoTitle: draft.seoTitle,
    excerpt: draft.excerpt,
    seoDescription: draft.seoDescription,
    slug: draft.slug,
    imageUrl: draft.imageUrl,
    imageAlt: draft.imageAlt,
    content: draft.content,
  };
  const seoChecks = blogSeoChecks(seoInput);
  // What the article's contents list will do, worked out the way the public page does it.
  const contentsNow = contentsPlan(draft.content, draft.contents, draft.faqs.filter(faq => faq.question && faq.answer).length);
  const sectionTag = `H${contentsNow.level}`;
  const contentsSummary = draft.contents === "hide" ? "No contents list on this post."
    : contentsNow.show ? `Readers get a Contents button listing ${contentsNow.sections.length} ${sectionTag} section${contentsNow.sections.length === 1 ? "" : "s"}.`
    : draft.contents === "show" ? `Not shown yet: needs at least two ${sectionTag} headings.`
    : `Not shown yet: needs ${CONTENTS_MIN_SECTIONS}+ sections and ${CONTENTS_MIN_WORDS.toLocaleString("en-IN")}+ words (now ${contentsNow.sections.length} ${sectionTag} and ${contentsNow.words.toLocaleString("en-IN")} words).`;
  const seoProblems = seoIssues(seoChecks);
  const shownTitle = googleTitle(seoInput);
  const shownDescription = googleDescription(seoInput);
  const commentsSummary = !commentDefaults.commentsEnabled ? "Closed (site-wide)"
    : draft.comments === "default" ? `Site default (${commentDefaults.commentDefault === "pending" ? "Moderated" : "Open"})`
    : draft.comments === "closed" ? "Closed" : draft.comments === "moderated" ? "Moderated" : "Open";

  function body() {
    return {
      title: draft.title,
      titleSize: draft.titleSize,
      contents: draft.contents,
      slug: draft.slug,
      excerpt: draft.excerpt,
      content: draft.content,
      type,
      visibility: draft.visibility,
      // Only an editor sees the control; anyone else leaves the post on the
      // site default, which is what the API would force anyway.
      comments: draft.comments,
      showViews: draft.showViews,
      sharing: draft.sharing,
      category: draft.category || undefined,
      tags: draft.tags.split(",").map(tag => tag.trim()).filter(Boolean),
      featuredImage: { url: draft.imageUrl, publicId: draft.imagePublicId, alt: draft.imageAlt },
      seo: { title: draft.seoTitle, description: draft.seoDescription, canonical: draft.canonical },
      faqs: draft.faqs,
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

  async function runAction(action: string, extra: Record<string, unknown> = {}, reviewed = false) {
    const needsReview = ["publish", "schedule"].includes(action)
      || (action === "save-draft" && ["published", "scheduled"].includes(status));
    if (needsReview && !reviewed) {
      openPreview({ action, extra });
      return;
    }
    await track(async () => {
      setMessage("");
      setError("");
      try {

        // Unpublishing must not first save unreviewed edits onto the live article.
        const id = action === "unpublish" ? postId : await persist();
        if (!id) return;

        if (action === "save-draft") {
          setMessage(status === "published" ? "Published article updated." : status === "scheduled" ? "Scheduled article updated." : "Changes saved.");
          setReviewAction(null);
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

        if (!response.ok) {
          setError(data.error ?? "Could not update the post.");
          return;
        }

        // Publishing or scheduling finishes the job, so go back to the list, which says what happened.
        if (action === "publish" || action === "schedule") {
          router.push(`/admin/blog?${new URLSearchParams({ done: action, post: data.slug })}`);
          router.refresh();
          return;
        }

        setStatus(data.status);
        setReviewAction(null);
        if (action === "unpublish") set("scheduledFor", "");
        setMessage(
          action === "submit"
            ? "Submitted for review."
            : action === "unpublish" && status === "scheduled"
              ? "Schedule cancelled. The post is a draft again."
              : "Updated.",
        );
        router.refresh();
        if (!blog) router.replace(`/admin/blog/${draft.slug}/edit`);
      } catch {
        setError("Could not save the article. Check your connection and try again.");
      }
    });
  }

  async function remove() {
    if (!postId || !window.confirm("Delete this post permanently?")) return;
    await track(async () => {
      const response = await fetch(`/api/blogs/${postId}`, { method: "DELETE" });
      if (response.ok) router.push("/admin/blog");
      else setError((await response.json()).error ?? "Could not delete the post.");
    });
  }

  return (
    <form className="admin-form" onSubmit={event => event.preventDefault()}>
      {/* Live while typing; the same checks run in the review queue and on /admin/seo. */}
      <details className="seo-summary">
        <summary className={seoProblems.some(check => check.level === "error") ? "seo-error" : seoProblems.length ? "seo-warning" : "seo-ok"}>
          SEO checklist — {seoProblems.length ? `${seoProblems.length} to improve` : "all good"}
        </summary>
        <SeoChecklist checks={seoChecks} onFix={focusSeoField} />
      </details>

      <div className="form-columns">
        <div className="admin-field">
          <label htmlFor="blog-title">
            <span>Article title</span>
          </label>
          <div className="title-row">
            <input
              id="blog-title"
              value={draft.title}
              onChange={event => set("title", event.target.value)}
              placeholder="Enter a useful, clear title"
            />
            {/* Size only: the title stays the page's <h1> either way. */}
            <select aria-label="Title size" value={draft.titleSize} onChange={event => set("titleSize", event.target.value as TitleSize)}>
              <option value="large">Large title (H1)</option>
              <option value="medium">Medium title (H2)</option>
            </select>
          </div>
        </div>
        <label className="admin-field">
          <span>
            URL slug
            {slugFree === false ? <em className="slug-taken"> — already used</em> : null}
            {slugFree === true ? <em className="slug-free"> — available</em> : null}
          </span>
          <input
            id="blog-slug"
            value={draft.slug}
            onChange={event => {
              set("slugTouched", true);
              set("slug", event.target.value);
            }}
            placeholder="article-url-slug"
          />
          <SeoHint checks={seoChecks} field="blog-slug" />
        </label>
      </div>

      <div className="form-columns">
        <div className="admin-field">
          <label htmlFor="blog-category">
            <span>Category</span>
          </label>
          <select id="blog-category" value={draft.category} onChange={event => set("category", event.target.value)}>
            {/* A saved category cannot be cleared (an empty value leaves it as it is), so "none" is offered only before one is set. */}
            {blog?.category ? null : <option value="">No category</option>}
            {categories.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {canAddCategory ? (
            newCategory === null ? (
              <button className="admin-action category-new" type="button" disabled={busy} onClick={() => { setNewCategory(""); setCategoryError(""); }}>
                + New category
              </button>
            ) : (
              <div className="category-inline category-new">
                <input aria-label="New category name" value={newCategory} maxLength={60} disabled={busy} onChange={event => setNewCategory(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void addCategory(); } }} placeholder="e.g. Web strategy" />
                <button className="admin-action" type="button" disabled={busy || newCategory.trim().length < 2} onClick={() => void addCategory()}>
                  Add
                </button>
                <button className="admin-action" type="button" disabled={busy} onClick={() => { setNewCategory(null); setCategoryError(""); }}>
                  Cancel
                </button>
              </div>
            )
          ) : null}
          {categoryError ? <p className="form-error">{categoryError}</p> : null}
        </div>
        <TagPicker value={draft.tags} onChange={value => set("tags", value)} suggestions={tagSuggestions} />
      </div>

      <label className="admin-field">
        <span>Short description</span>
        <textarea
          value={draft.excerpt}
          onChange={event => set("excerpt", event.target.value)}
          rows={3}
          placeholder="A concise article summary for readers and search."
        />
        {/* Google is given this text while the meta description is empty. */}
        {draft.seoDescription.trim() ? null : <SeoHint checks={seoChecks} field="seo-description" />}
      </label>

      <div className="admin-field" id="blog-content">
        <span>Article content</span>
        <p className="field-hint">Write only what readers should see. Add SEO details, image details and publishing settings in the fields below.</p>
        <TiptapEditor value={draft.content} onChange={content => set("content", content)} imageSources={imageSources} />
        {briefWarnings.length > 0 ? (
          <p className="form-error" role="status">Possible publishing instructions in the article: {briefWarnings.join(", ")}. Review this text before publishing; it will be visible to readers.</p>
        ) : null}
        <SeoHint checks={seoChecks} field="blog-content" />
        <label className="admin-field">
          <span>Contents list</span>
          <select value={draft.contents} onChange={event => set("contents", event.target.value as ContentsMode)}>
            <option value="auto">Auto — only for a long article ({CONTENTS_MIN_SECTIONS}+ sections, {CONTENTS_MIN_WORDS.toLocaleString("en-IN")}+ words)</option>
            <option value="show">Show — always list the sections</option>
            <option value="hide">Hide — no contents list</option>
          </select>
          <small className="field-hint">
            {contentsSummary} The list uses your largest headings (H2, or H3 when there is no H2), so keep those for section titles, not lead-in lines like &ldquo;Here are the reasons:&rdquo;.
          </small>
        </label>
      </div>

      <section className="admin-seo" id="blog-featured-image">
        <h2>Featured image</h2>
        <div className="form-columns">
          <MediaPicker
            url={draft.imageUrl}
            fromLibrary={Boolean(draft.imagePublicId)}
            sources={imageSources}
            onChoose={choice => {
              const asset = choice.kind === "library" ? choice.asset : undefined;
              if (asset) setKnownAssets(current => (current.some(item => item._id === asset._id) ? current : [asset, ...current]));
              setDraft(current => {
                // The library's default alt text fills in unless the editor wrote their own.
                // Library alt text may run to 300 characters; a post allows 160 (blog-rules.ts).
                const libraryAlt = (item?: MediaAsset) => (item?.altText ?? "").slice(0, 160);
                const previous = knownAssets.find(item => item.url === current.imageUrl);
                const ownAlt = current.imageAlt.trim() && current.imageAlt !== libraryAlt(previous);
                // Alt text typed in the URL tab wins; an outside URL has no library default.
                if (choice.kind === "url") return { ...current, imageUrl: choice.url, imagePublicId: "", imageAlt: choice.alt ? choice.alt.slice(0, 160) : ownAlt ? current.imageAlt : "" };
                return { ...current, imageUrl: choice.asset.url, imagePublicId: choice.asset.publicId, imageAlt: ownAlt ? current.imageAlt : libraryAlt(choice.asset) };
              });
            }}
            onRemove={() => setDraft(current => ({ ...current, imageUrl: "", imagePublicId: "", imageAlt: "" }))}
          />
          <label className="admin-field">
            <span>Alt text</span>
            <input id="blog-image-alt" value={draft.imageAlt} onChange={event => set("imageAlt", event.target.value)} placeholder="Describe the image" />
            <SeoHint checks={seoChecks} field="blog-image-alt" />
          </label>
        </div>
        <SeoHint checks={seoChecks} field="blog-featured-image" />
      </section>

      <section className="admin-seo" id="blog-faqs">
        <h2>FAQs</h2>
        <p className="field-hint">
          Optional. Short questions readers search for, each answered in a few sentences. They appear after the article and are marked up for search and AI
          engines. Leave a row half empty and it is dropped on save.
        </p>
        {draft.faqs.map((faq, index) => (
          <div className="faq-row" key={index}>
            <label className="admin-field">
              <span>Question {index + 1}</span>
              <input
                value={faq.question}
                maxLength={200}
                onChange={event => set("faqs", draft.faqs.map((row, i) => (i === index ? { ...row, question: event.target.value } : row)))}
                placeholder="e.g. How long does a website take to build?"
              />
            </label>
            <label className="admin-field">
              <span>Answer</span>
              <textarea
                value={faq.answer}
                maxLength={1500}
                rows={3}
                onChange={event => set("faqs", draft.faqs.map((row, i) => (i === index ? { ...row, answer: event.target.value } : row)))}
                placeholder="Answer directly in the first sentence."
              />
            </label>
            <button className="admin-action" type="button" onClick={() => set("faqs", draft.faqs.filter((_, i) => i !== index))}>
              Remove
            </button>
          </div>
        ))}
        {draft.faqs.length < MAX_FAQS ? (
          <button className="admin-action" type="button" onClick={() => set("faqs", [...draft.faqs, { question: "", answer: "" }])}>
            + Add a question
          </button>
        ) : null}
      </section>

      <section className="admin-seo">
        <h2>SEO &amp; visibility</h2>
        <div className="form-columns">
          <label className="admin-field">
            <span>SEO title</span>
            <input id="seo-title" value={draft.seoTitle} onChange={event => set("seoTitle", event.target.value)} placeholder="Page title for Google" />
            <SeoHint checks={seoChecks} field="seo-title" />
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
            id="seo-description"
            value={draft.seoDescription}
            onChange={event => set("seoDescription", event.target.value)}
            rows={2}
            placeholder="Search result summary"
          />
          <SeoHint checks={seoChecks} field="seo-description" />
        </label>

        <SerpPreview path={`/blog/${draft.slug || "article-url"}`} title={shownTitle} description={shownDescription} />
        {/* The post's own address is used automatically; this only overrides it. */}
        <details className="admin-advanced" open={!!draft.canonical}>
          <summary>Advanced</summary>
          <label className="admin-field">
            <span>Canonical URL — leave empty</span>
            <input value={draft.canonical} onChange={event => set("canonical", event.target.value)} placeholder="Filled automatically from the post's URL" />
            <small className="field-hint">
              Only fill this if the article was first published on another website — then paste that page&apos;s address.
            </small>
          </label>
        </details>

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

        {canPublish ? (
          <label className="admin-field">
            <span>Share buttons on this post</span>
            <select value={draft.sharing} onChange={event => set("sharing", event.target.value as ShareMode)}>
              <option value="default">Site default — follow the setting in Site settings</option>
              <option value="show">Show — readers can share this post</option>
              <option value="hide">Hide — no share buttons on this post</option>
            </select>
          </label>
        ) : null}
      </section>

      {canPublish ? (
        <section className="admin-seo">
          <h2>Schedule</h2>
          <label className="admin-field">
            <span>Publish at (your local time)</span>
            <input type="datetime-local" value={draft.scheduledFor} onChange={event => set("scheduledFor", event.target.value)} />
          </label>
        </section>
      ) : null}

      {status === "published" ? <p className="field-hint">Updating this article changes the live page. To take it offline first, choose Unpublish.</p> : null}

      {previewOpen ? (
        // Covers the whole screen with its own scroll, so a long article is
        // read without leaving the editor. It stays inside the panel, which
        // carries the light/dark colours, and under the loaders.
        <div className="blog-preview-overlay" role="dialog" aria-modal="true" aria-labelledby="blog-preview-title" ref={previewDialog} onKeyDown={previewKeys}>
          <div className="blog-preview-bar">
            <h2 id="blog-preview-title">{reviewAction ? "Review before publishing" : "Article preview"}</h2>
            <div className="blog-preview-buttons">
              <button className="admin-button secondary" type="button" data-autofocus disabled={busy} onClick={closePreview}>
                Close preview
              </button>
              {reviewAction ? (
                <button className="admin-button" type="button" disabled={busy} onClick={() => runAction(reviewAction.action, reviewAction.extra, true)}>
                  {busy ? "Working…" : `${reviewAction.action === "schedule" ? "Confirm schedule" : reviewAction.action === "save-draft" ? "Confirm update" : "Confirm publish"}${seoProblems.length ? " anyway" : ""}`}
                </button>
              ) : null}
            </div>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
          </div>
          <div className={`blog-preview-body ${styles.preview}`}>
            {/* Shown once, before the post goes live; nothing is blocked (owner decision). */}
            {seoProblems.length ? (
              <div className="seo-review" role="status">
                <p>
                  <b>
                    {seoProblems.length} SEO issue{seoProblems.length === 1 ? "" : "s"} on this article.
                  </b>{" "}
                  {reviewAction ? "Fix them first, or go ahead anyway." : "Fix them before publishing."}
                </p>
                <SeoChecklist checks={seoProblems} onFix={fixFromPreview} />
              </div>
            ) : null}
            <details className="blog-preview-details">
              <summary>SEO &amp; publishing details</summary>
              <dl>
                <dt>SEO title</dt><dd>{draft.seoTitle || draft.title} | Mera Software</dd>
                <dt>Meta description</dt><dd>{draft.seoDescription || draft.excerpt}</dd>
                <dt>Canonical URL</dt><dd>{draft.canonical || `${SITE_URL}/blog/${draft.slug}`}</dd>
                <dt>Visibility</dt><dd>{draft.visibility}</dd>
                <dt>Comments</dt><dd>{commentsSummary}</dd>
                <dt>Featured image</dt><dd>{draft.imageUrl ? draft.imageAlt || "Alt text is missing" : "No featured image selected"}</dd>
                <dt>Publication</dt><dd>{!reviewAction ? `Current status: ${status}` : reviewAction.action === "schedule" ? `Scheduled for ${new Date(draft.scheduledFor).toLocaleString()}` : status === "scheduled" && reviewAction.action === "save-draft" ? `Keeps the saved schedule: ${blog?.scheduledFor ? new Date(blog.scheduledFor).toLocaleString() : "scheduled"}` : status === "published" ? "Updates the live article immediately" : "Publish makes this article live immediately"}</dd>
              </dl>
            </details>
            {briefWarnings.length > 0 ? <p className="form-error">Review these possible instructions in the reader preview: {briefWarnings.join(", ")}. Nothing is removed automatically.</p> : null}
            <article className={styles.article}>
              <h2>{draft.title}</h2>
              <p>{draft.excerpt}</p>
              {draft.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.imageUrl} alt={draft.imageAlt} style={{ maxWidth: "100%" }} />
              ) : null}
              <RichContent content={draft.content} contents={draft.contents} faqs={draft.faqs} />
            </article>
          </div>
        </div>
      ) : null}

      {/* Stays at the bottom of the screen on wider screens, so saving never needs a scroll to the end. Its message shows here too. */}
      <div className="form-actions blog-actions">
        <span className={`status status-${status === "published" ? "live" : "draft"}`}>{status}</span>
        {error && !previewOpen ? <p className="form-error blog-actions-note" role="alert">{error}</p> : null}
        {message ? <p className="form-message blog-actions-note" role="status">{message}</p> : null}

        {postId ? (
          <button className="admin-button danger" type="button" onClick={remove} disabled={busy}>
            Delete
          </button>
        ) : null}

        <button className="admin-button secondary" type="button" onClick={() => openPreview(null)} disabled={busy}>
          Preview article
        </button>
        <button className="admin-button secondary" type="button" onClick={() => runAction("save-draft")} disabled={busy}>
          {status === "published" ? "Update published article" : status === "scheduled" ? "Update scheduled article" : status === "draft" ? "Save draft" : "Save changes"}
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
            {status === "scheduled" ? (
              <button className="admin-button secondary" type="button" onClick={() => runAction("unpublish")} disabled={busy}>
                Cancel schedule
              </button>
            ) : null}
            {status !== "published" ? <button className="admin-button" type="button" onClick={() => runAction("publish")} disabled={busy}>
              {busy ? "Working…" : "Publish article →"}
            </button> : null}
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
