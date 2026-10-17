"use client";

import { mergeAttributes, Node, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useMemo, useRef } from "react";
import type { TemplateVariable } from "@/lib/email-control-types";
import styles from "./email-control.module.css";

/**
 * The visual email editor — the blog's Tiptap look, limited to what an email can show:
 * bold, headings, bullet lists, links, and "details" (variables) and sections as named chips.
 * The backend alone converts its document to the stored template text (backend/helpers/emailDoc.js);
 * the node names and attributes below are that contract.
 */
type Labels = Record<string, { label: string; hint?: string }>;
const chipLabel = (labels: Labels, key: string) => labels[key]?.label || key;
const chipHint = (labels: Labels, key: string) => labels[key]?.hint || "";

const EmailVariable = Node.create<{ labels: Labels }>({
  name: "emailVariable",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addOptions() { return { labels: {} }; },
  addAttributes() { return { key: { default: null } }; },
  parseHTML() { return [{ tag: "span[data-email-variable]", getAttrs: element => ({ key: (element as HTMLElement).dataset.emailVariable }) }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-email-variable": node.attrs.key, class: styles.chip, title: chipHint(this.options.labels, node.attrs.key) }), chipLabel(this.options.labels, node.attrs.key)];
  },
  renderText({ node }) { return `[${chipLabel(this.options.labels, node.attrs.key)}]`; },
});

const EmailSection = Node.create<{ labels: Labels }>({
  name: "emailSection",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addOptions() { return { labels: {} }; },
  addAttributes() { return { key: { default: null } }; },
  parseHTML() { return [{ tag: "div[data-email-section]", getAttrs: element => ({ key: (element as HTMLElement).dataset.emailSection }) }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-email-section": node.attrs.key, class: styles.sectionChip, title: chipHint(this.options.labels, node.attrs.key) }), `▦ ${chipLabel(this.options.labels, node.attrs.key)}`];
  },
});

// A subject is one line: its document holds exactly one paragraph.
const SubjectDocument = Node.create({ name: "doc", topNode: true, content: "paragraph" });

const OFF = { blockquote: false, code: false, codeBlock: false, horizontalRule: false, italic: false, orderedList: false, strike: false, underline: false } as const;

export const emptyDoc: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };
/** A document holding just one detail chip, e.g. a new template's {{subject}}. */
export const chipDoc = (key: string): JSONContent => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "emailVariable", attrs: { key } }] }] });
/** Plain text as paragraphs — only for a backend older than the editor, which sends no document. */
export const plainDoc = (text = ""): JSONContent => ({ type: "doc", content: text.split(/\n{2,}/).map(block => ({ type: "paragraph", content: block ? [{ type: "text", text: block }] : [] })) });
/** True when a document holds any text or chip. */
export function docHasContent(node: JSONContent | undefined): boolean {
  if (!node) return false;
  if (node.type === "emailVariable" || node.type === "emailSection") return true;
  if (node.type === "text") return !!node.text?.trim();
  return (node.content || []).some(docHasContent);
}

type Props = {
  id: string; label: string; value: JSONContent | undefined; onChange: (doc: JSONContent) => void;
  disabled?: boolean; singleLine?: boolean; variables?: TemplateVariable[]; blocks?: TemplateVariable[];
};

export function EmailEditor({ id, label, value, onChange, disabled, singleLine, variables = [], blocks = [] }: Props) {
  // Keyed by content: callers pass fresh arrays each render, and a new key rebuilds the editor.
  const labelsKey = JSON.stringify([...variables, ...blocks].map(row => [row.key, { label: row.label, hint: row.hint }]));
  const labels = useMemo<Labels>(() => Object.fromEntries(JSON.parse(labelsKey)), [labelsKey]);
  // The editor owns its document while typing; outside changes (template switch, reset) are pushed in.
  const emitted = useRef<string>("");
  const editor = useEditor({
    immediatelyRender: false,
    // The toolbar shows Bold/Heading/List as on for the text under the cursor.
    shouldRerenderOnTransaction: true,
    editable: !disabled,
    extensions: singleLine
      ? [StarterKit.configure({ ...OFF, document: false, heading: false, bulletList: false, listItem: false, listKeymap: false, hardBreak: false, bold: false, link: false, dropcursor: false, gapcursor: false, trailingNode: false }), SubjectDocument, EmailVariable.configure({ labels })]
      : [StarterKit.configure({ ...OFF, heading: { levels: [2] }, link: { autolink: true, openOnClick: false, linkOnPaste: true } }), EmailVariable.configure({ labels }), EmailSection.configure({ labels })],
    content: value ?? emptyDoc,
    editorProps: {
      attributes: { id, role: "textbox", "aria-label": label, "aria-multiline": String(!singleLine), class: `tiptap-surface ${styles.surface} ${singleLine ? styles.singleLine : ""}` },
      // Enter would add a second paragraph a subject cannot hold.
      handleKeyDown: (_, event) => !!singleLine && event.key === "Enter",
    },
    onUpdate: ({ editor: instance }) => { const doc = instance.getJSON(); emitted.current = JSON.stringify(doc); onChange(doc); },
  }, [labelsKey, singleLine]);

  useEffect(() => {
    if (!editor || !value || JSON.stringify(value) === emitted.current) return;
    emitted.current = JSON.stringify(value);
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);
  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);

  const insert = (content: JSONContent) => editor?.chain().focus().insertContent(content).run();
  const choices = [...variables.map(row => ({ ...row, kind: "emailVariable" })), ...blocks.map(row => ({ ...row, kind: "emailSection" }))];
  return <div className={styles.editorField}>
    <span className={styles.editorLabel} id={`${id}-label`}>{label}</span>
    <div className="tiptap-wrap">
      <div className="tiptap-toolbar" role="toolbar" aria-label={`${label} formatting`}>
        {!singleLine && <>
          <button type="button" disabled={disabled || !editor} className={editor?.isActive("bold") ? "on" : ""} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)"><b>B</b> Bold</button>
          <button type="button" disabled={disabled || !editor} className={editor?.isActive("heading") ? "on" : ""} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>Heading</button>
          <button type="button" disabled={disabled || !editor} className={editor?.isActive("bulletList") ? "on" : ""} onClick={() => editor?.chain().focus().toggleBulletList().run()}>• List</button>
          {!!choices.length && <span className="tiptap-divider" />}
        </>}
        {!!choices.length && <select aria-label={`Insert detail into ${label}`} disabled={disabled || !editor} value="" className={styles.insertDetail}
          onChange={event => { const choice = choices.find(row => `${row.kind}:${row.key}` === event.target.value); if (choice) insert({ type: choice.kind, attrs: { key: choice.key } }); }}>
          <option value="">Insert detail…</option>
          {variables.length > 0 && <optgroup label="Details">{variables.map(row => <option key={row.key} value={`emailVariable:${row.key}`} title={row.hint}>{row.label}</option>)}</optgroup>}
          {blocks.length > 0 && <optgroup label="Sections">{blocks.map(row => <option key={row.key} value={`emailSection:${row.key}`} title={row.hint}>{row.label}</option>)}</optgroup>}
        </select>}
      </div>
      <EditorContent editor={editor} />
    </div>
    {!singleLine && !!choices.length && <p className={styles.muted}>Point at a detail to see what it holds. A line whose details are all empty is left out of the email.</p>}
  </div>;
}

/** The final mail as the backend rendered it; sandboxed so it can never run script. */
export function EmailPreview({ html }: { html: string }) {
  return <iframe className={styles.preview} title="Email preview" sandbox="" srcDoc={html} />;
}
