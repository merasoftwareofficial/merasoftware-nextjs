"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useState } from "react";
import { ImageChooser, type ImageSources } from "@/components/image-chooser";
import { editorExtensions, emptyDoc, NORMAL_REL, SPONSORED_REL, UGC_REL } from "./extensions";

type LinkRel = "normal" | "ugc" | "sponsored";

/** Members' posts: an outside URL only, never our library or Cloudinary. */
const URL_ONLY: ImageSources = { upload: false, library: false, url: true };

const REL_VALUE: Record<LinkRel, string> = {
  normal: NORMAL_REL,
  ugc: UGC_REL,
  sponsored: SPONSORED_REL,
};

/**
 * A button's tooltip with its keyboard shortcut, written the way this computer
 * shows it. The shortcuts are Tiptap's own (StarterKit); nothing here adds one.
 * Only called once the editor exists, which is always in the browser.
 */
function hint(label: string, keys?: string) {
  if (!keys) return label;
  const mac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  const shortcut = mac
    ? keys.replace("Mod", "⌘").replace("Alt", "⌥").replace("Shift", "⇧").replaceAll("-", "")
    : keys.replace("Mod", "Ctrl").replaceAll("-", "+");
  return `${label} (${shortcut})`;
}

export function TiptapEditor({
  value,
  onChange,
  placeholder = "Start writing…",
  imageSources = URL_ONLY,
}: {
  value?: unknown;
  onChange: (doc: unknown) => void;
  placeholder?: string;
  /** Where the Image button may take images from (imageSourcesFor in image-chooser.tsx). */
  imageSources?: ImageSources;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkRel, setLinkRel] = useState<LinkRel>("normal");

  const editor = useEditor({
    extensions: editorExtensions,
    content: (value as object) ?? emptyDoc,
    // Next renders this component on the server first; Tiptap needs to know.
    immediatelyRender: false,
    editorProps: { attributes: { class: "tiptap-surface", "data-placeholder": placeholder } },
    onUpdate: ({ editor: instance }) => onChange(instance.getJSON()),
  });

  if (!editor) return <div className="tiptap-loading">Loading editor…</div>;

  const active = (name: string, attrs?: Record<string, unknown>) => editor.isActive(name, attrs);

  function applyLink() {
    if (!editor) return;
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().unsetLink().run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: url, rel: REL_VALUE[linkRel], target: "_blank" })
        .run();
    }
    setLinkOpen(false);
    setLinkUrl("");
  }


  return (
    <div className="tiptap-wrap">
      {/* Toolbar and link bar stay in view while a long article scrolls under them. */}
      <div className="tiptap-bar">
        <div className="tiptap-toolbar">
          <button type="button" className={active("bold") ? "on" : ""} onClick={() => editor.chain().focus().toggleBold().run()} title={hint("Bold", "Mod-B")}>
            <b>B</b>
          </button>
          <button type="button" className={active("italic") ? "on" : ""} onClick={() => editor.chain().focus().toggleItalic().run()} title={hint("Italic", "Mod-I")}>
            <i>I</i>
          </button>
          <button type="button" className={active("strike") ? "on" : ""} onClick={() => editor.chain().focus().toggleStrike().run()} title={hint("Strikethrough", "Mod-Shift-S")}>
            <s>S</s>
          </button>

          <span className="tiptap-divider" />

          {[2, 3, 4].map(level => (
            <button
              key={level}
              type="button"
              className={active("heading", { level }) ? "on" : ""}
              onClick={() => editor.chain().focus().toggleHeading({ level: level as 2 | 3 | 4 }).run()}
              title={hint(`Heading ${level}`, `Mod-Alt-${level}`)}
            >
              H{level}
            </button>
          ))}

          <span className="tiptap-divider" />

          <button type="button" className={active("bulletList") ? "on" : ""} onClick={() => editor.chain().focus().toggleBulletList().run()} title={hint("Bullet list", "Mod-Shift-8")}>
            • List
          </button>
          <button type="button" className={active("orderedList") ? "on" : ""} onClick={() => editor.chain().focus().toggleOrderedList().run()} title={hint("Numbered list", "Mod-Shift-7")}>
            1. List
          </button>
          <button type="button" className={active("blockquote") ? "on" : ""} onClick={() => editor.chain().focus().toggleBlockquote().run()} title={hint("Quote", "Mod-Shift-B")}>
            &ldquo; Quote
          </button>
          <button type="button" className={active("codeBlock") ? "on" : ""} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title={hint("Code block", "Mod-Alt-C")}>
            Code
          </button>

          <span className="tiptap-divider" />

          <button type="button" className={active("link") ? "on" : ""} onClick={() => setLinkOpen(open => !open)} title="Add link">
            Link
          </button>
          <button type="button" onClick={() => setImageOpen(true)} title="Insert image">
            Image
          </button>

          <span className="tiptap-divider" />

          <button type="button" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title={hint("Undo", "Mod-Z")}>
            ↶
          </button>
          <button type="button" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title={hint("Redo", "Mod-Y")}>
            ↷
          </button>
        </div>

        {linkOpen ? (
          <div className="tiptap-link-bar">
            <input
              value={linkUrl}
              onChange={event => setLinkUrl(event.target.value)}
              placeholder="https://example.com — leave empty to remove the link"
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                }
              }}
            />
            <select value={linkRel} onChange={event => setLinkRel(event.target.value as LinkRel)}>
              <option value="normal">Normal link</option>
              <option value="ugc">User content (rel=ugc)</option>
              <option value="sponsored">Paid / sponsored</option>
            </select>
            <button type="button" className="admin-button" onClick={applyLink}>
              Apply
            </button>
          </div>
        ) : null}
      </div>

      <EditorContent editor={editor} />
      {imageOpen ? (
        <ImageChooser
          sources={imageSources}
          onClose={() => setImageOpen(false)}
          onChoose={choice => {
            const image = choice.kind === "library" ? { src: choice.asset.url, alt: choice.asset.altText } : { src: choice.url, alt: choice.alt };
            editor.chain().focus().setImage(image).run();
            setImageOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
