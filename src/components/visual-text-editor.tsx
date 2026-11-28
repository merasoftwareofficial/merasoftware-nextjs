"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, type MutableRefObject, type ReactNode } from "react";
import {
  sanitizeVisualHtml,
  textToVisualHtml,
  visualHtmlToMessageMarkup,
  visualHtmlToPlainText,
} from "@/lib/visual-text";

export type VisualTextEditorHandle = {
  insertText: (text: string) => void;
  focus: () => void;
};

/**
 * SSOT Reusable Visual Text Editor (WYSIWYG) for Mera Software Control Panel.
 *
 * - Shows live visual Bold, Italic, Underline, Bullet List, Numbered List, and real Enter line gaps
 *   directly inside the box (never exposes raw `*` or `_` stars).
 * - Toolbar buttons highlight immediately when cursor is inside formatted text.
 * - `mode="html"` stores clean sanitized HTML (for Website fields like Package Description).
 * - `mode="message"` stores clean multi-channel markup (for Automated Message System: WhatsApp + Email).
 */
export function VisualTextEditor({
  id,
  ariaLabel,
  value,
  onChange,
  mode = "html",
  placeholder = "Start typing…",
  disabled = false,
  minHeight = 104,
  showUnderline = true,
  showOrderedList = true,
  extraToolbar,
  handleRef,
}: {
  id?: string;
  ariaLabel: string;
  value: string;
  onChange: (next: string) => void;
  mode?: "html" | "message";
  placeholder?: string;
  disabled?: boolean;
  minHeight?: number;
  showUnderline?: boolean;
  showOrderedList?: boolean;
  extraToolbar?: ReactNode;
  handleRef?: MutableRefObject<VisualTextEditorHandle | null>;
}) {
  const lastEmittedRef = useRef<string>(value);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        link: false,
        underline: showUnderline ? {} : false,
        orderedList: showOrderedList ? {} : false,
      }),
    ],
    content: textToVisualHtml(value) || "<p></p>",
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        role: "textbox",
        "aria-label": ariaLabel,
        "aria-multiline": "true",
        "data-placeholder": placeholder,
        class: "visual-text-surface",
        style: `min-height:${minHeight}px`,
      },
    },
    onUpdate: ({ editor: instance }) => {
      const rawHtml = instance.getHTML();
      const plain = visualHtmlToPlainText(rawHtml);
      const next = !plain
        ? ""
        : mode === "message"
          ? visualHtmlToMessageMarkup(rawHtml)
          : sanitizeVisualHtml(rawHtml);
      lastEmittedRef.current = next;
      onChange(next);
    },
  }, [mode, showUnderline, showOrderedList]);

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = editor
      ? {
          insertText: (text: string) => {
            editor.chain().focus().insertContent(text).run();
          },
          focus: () => {
            editor.chain().focus().run();
          },
        }
      : null;
    return () => {
      if (handleRef) handleRef.current = null;
    };
  }, [editor, handleRef]);

  useEffect(() => {
    if (!editor) return;
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    const html = textToVisualHtml(value) || "<p></p>";
    editor.commands.setContent(html, { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

  const active = (name: string) => Boolean(editor?.isActive(name));

  return (
    <div className="visual-text-editor" data-disabled={disabled ? "true" : "false"}>
      <div className="visual-text-toolbar" role="toolbar" aria-label={`${ariaLabel} formatting`}>
        <div className="visual-text-toolbar-group">
          <button
            type="button"
            disabled={disabled || !editor}
            data-active={active("bold") ? "true" : "false"}
            aria-pressed={active("bold")}
            title="Bold (Ctrl+B)"
            onMouseDown={e => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            disabled={disabled || !editor}
            data-active={active("italic") ? "true" : "false"}
            aria-pressed={active("italic")}
            title="Italic (Ctrl+I)"
            onMouseDown={e => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <em>I</em>
          </button>
          {showUnderline && (
            <button
              type="button"
              disabled={disabled || !editor}
              data-active={active("underline") ? "true" : "false"}
              aria-pressed={active("underline")}
              title="Underline (Ctrl+U)"
              onMouseDown={e => e.preventDefault()}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
            >
              <u>U</u>
            </button>
          )}
          <span className="visual-text-sep" aria-hidden="true" />
          <button
            type="button"
            disabled={disabled || !editor}
            data-active={active("bulletList") ? "true" : "false"}
            aria-pressed={active("bulletList")}
            title="Bullet list"
            onMouseDown={e => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            • List
          </button>
          {showOrderedList && (
            <button
              type="button"
              disabled={disabled || !editor}
              data-active={active("orderedList") ? "true" : "false"}
              aria-pressed={active("orderedList")}
              title="Numbered list"
              onMouseDown={e => e.preventDefault()}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            >
              1. List
            </button>
          )}
          <span className="visual-text-sep" aria-hidden="true" />
          <button
            type="button"
            disabled={disabled || !editor || !editor.can().undo()}
            title="Undo (Ctrl+Z)"
            onMouseDown={e => e.preventDefault()}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            ↶
          </button>
          <button
            type="button"
            disabled={disabled || !editor || !editor.can().redo()}
            title="Redo (Ctrl+Y)"
            onMouseDown={e => e.preventDefault()}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            ↷
          </button>
        </div>
        {extraToolbar ? <div className="visual-text-toolbar-extra">{extraToolbar}</div> : null}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

/**
 * SSOT Renderer for visual formatted text across Website (Package Cards, Package Pages,
 * Offer Previews) and Admin Previews. Safely renders sanitized HTML or legacy text with real line gaps.
 */
export function VisualText({
  value,
  className = "",
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const html = textToVisualHtml(value);
  if (!html) return null;
  return (
    <div
      className={`visual-text-content ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
