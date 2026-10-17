"use client";

import { useRef } from "react";
import type { TemplateVariable } from "@/lib/email-control-types";
import styles from "./email-control.module.css";

type Props = {
  id: string; label: string; value: string; onChange: (value: string) => void;
  disabled?: boolean; rows?: number; variables?: TemplateVariable[]; blocks?: TemplateVariable[];
};

/**
 * Email text with the template markup the backend renders (backend/helpers/emailMarkup.js):
 * **bold**, "## " headings, "- " list items, {{variables}} and section blocks on their own line.
 */
export function TemplateTextEditor({ id, label, value, onChange, disabled, rows = 12, variables = [], blocks = [] }: Props) {
  const area = useRef<HTMLTextAreaElement>(null);
  function edit(change: (text: string, start: number, end: number) => { text: string; start: number; end: number }) {
    const element = area.current; if (!element || disabled) return;
    const next = change(value, element.selectionStart, element.selectionEnd);
    onChange(next.text);
    requestAnimationFrame(() => { element.focus(); element.setSelectionRange(next.start, next.end); });
  }
  const bold = () => edit((text, start, end) => {
    const selected = text.slice(start, end) || "bold text";
    return { text: `${text.slice(0, start)}**${selected}**${text.slice(end)}`, start: start + 2, end: start + 2 + selected.length };
  });
  // Prefixes every line the selection touches, e.g. "## " or "- ".
  const prefixLines = (prefix: string) => edit((text, start, end) => {
    const from = text.lastIndexOf("\n", start - 1) + 1;
    const newline = text.indexOf("\n", end);
    const to = newline === -1 ? text.length : newline;
    const block = text.slice(from, to).split("\n").map(line => line.startsWith(prefix) ? line : prefix + line).join("\n");
    return { text: text.slice(0, from) + block + text.slice(to), start: from, end: from + block.length };
  });
  const insert = (token: string, ownLine: boolean) => edit((text, start, end) => {
    const before = text.slice(0, start); const after = text.slice(end);
    const lead = ownLine && before && !before.endsWith("\n") ? "\n" : "";
    const trail = ownLine && !after.startsWith("\n") ? "\n" : "";
    const inserted = `${lead}${token}${trail}`;
    return { text: before + inserted + after, start: start + inserted.length, end: start + inserted.length };
  });
  return <>
    <label htmlFor={id}>{label}</label>
    <div className={styles.toolbarRow} role="toolbar" aria-label={`${label} formatting`}>
      <button type="button" disabled={disabled} onClick={bold}><strong>B</strong> Bold</button>
      <button type="button" disabled={disabled} onClick={() => prefixLines("## ")}>Heading</button>
      <button type="button" disabled={disabled} onClick={() => prefixLines("- ")}>List</button>
    </div>
    <textarea id={id} ref={area} required rows={rows} maxLength={100000} disabled={disabled} value={value} onChange={event => onChange(event.target.value)} />
    {!!(variables.length || blocks.length) && <div className={styles.variables}>
      <span className={styles.muted}>Insert:</span>
      {variables.map(row => <button type="button" key={row.key} disabled={disabled} title={row.label} onClick={() => insert(`{{${row.key}}}`, false)}>{`{{${row.key}}}`}</button>)}
      {blocks.map(row => <button type="button" key={row.key} disabled={disabled} title={`${row.label} — placed on its own line`} onClick={() => insert(`{{${row.key}}}`, true)}>{`{{${row.key}}}`} section</button>)}
    </div>}
    <p className={styles.muted}>**bold** · &quot;## &quot; heading · &quot;- &quot; list item · links are detected. A line whose variables are all empty is left out.</p>
  </>;
}

/** The final mail as the backend rendered it; sandboxed so it can never run script. */
export function EmailPreview({ html }: { html: string }) {
  return <iframe className={styles.preview} title="Email preview" sandbox="" srcDoc={html} />;
}
