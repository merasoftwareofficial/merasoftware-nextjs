"use client";

import { useEffect, useState } from "react";
import { VisualsEditor } from "@/app/admin/visuals/visuals-editor";
import { LinkPicker } from "@/components/link-picker";
import type { LinkGroup } from "@/lib/link-options";
import { sectionSchema, sectionVisualOptions, memberSchema, projectSchema, serviceItemSchema, groupSchema, type ManagedPage } from "@/lib/page-content";
import type { MediaAsset, SectionVisualConfig } from "@/lib/repo/types";
import s from "./page-section-editor.module.css";

type Value = string | boolean | Value[] | { [key: string]: Value };
type Fields = { [key: string]: Value };
const labels: Record<string, string> = { enabled: "Show this section", eyebrow: "Small heading", heading: "Main heading", emphasis: "Emphasised heading text", lineBreak: "Start emphasis on a new line", lead: "Introduction", buttonLabel: "Button text", buttonHref: "Button destination", paragraphs: "Paragraphs", members: "Team members", position: "Position / ownership", role: "Role", projects: "Selected projects", href: "Destination", imageUrl: "Fallback image URL", alt: "Image description", hint: "Service selection hint", groups: "Service groups", label: "Group label", items: "Services", inclusions: "Included work", action: "Action text", previewImageUrl: "Default preview image URL", previewAlt: "Preview image description", previewLabel: "Preview caption", previewHref: "Preview destination", secondaryLabel: "Secondary link text", secondaryHref: "Secondary destination" };
const label = (key: string) => labels[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, text => text.toUpperCase());
function newItem(key: string): Value {
  const id = crypto.randomUUID();
  if (key === "members") return memberSchema.parse({ id, name: "New team member", position: "", role: "", description: "" });
  if (key === "projects") return projectSchema.parse({ id, brand: "New project", category: "", description: "", href: "/work", imageUrl: "", alt: "" });
  if (key === "items") return serviceItemSchema.parse({ id, title: "New service", description: "", inclusions: [], href: "/contact", action: "Discuss this service" });
  if (key === "groups") return groupSchema.parse({ id, title: "New service group", label: "", description: "", items: [] });
  return "";
}

function Field({ name, value, onChange, links }: { name: string; value: Value; onChange: (value: Value) => void; links: LinkGroup[] }) {
  if (typeof value === "boolean") return <label className={s.check}><input type="checkbox" checked={value} onChange={event => onChange(event.target.checked)} />{label(name)}</label>;
  if (typeof value === "string") {
    if (/href$/i.test(name)) return <LinkPicker label={label(name)} value={value} onChange={onChange} groups={links} />;
    const long = ["description", "lead", "heading", "emphasis", "paragraph", "inclusion"].includes(name);
    return <label className="admin-field"><span>{label(name)}</span>{long ? <textarea aria-label={label(name)} rows={name === "description" ? 3 : 2} value={value} onChange={event => onChange(event.target.value)} /> : <input aria-label={label(name)} value={value} onChange={event => onChange(event.target.value)} />}</label>;
  }
  if (Array.isArray(value)) {
    const limit = name === "groups" ? 6 : name === "paragraphs" ? 8 : name === "members" || name === "projects" ? 12 : 20;
    return <fieldset className={s.list}><legend>{label(name)}</legend>{value.map((entry, index) => {
      const object = typeof entry === "object" && !Array.isArray(entry) ? entry : undefined;
      return <div className={s.entry} key={object?.id as string ?? index}>
        <div className={s.entryBar}><strong>{object?.name as string || object?.title as string || object?.brand as string || `${label(name)} ${index + 1}`}</strong><div>
          <button type="button" aria-label={`Move ${label(name)} ${index + 1} up`} disabled={index === 0} onClick={() => { const next = [...value]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }}>↑</button>
          <button type="button" aria-label={`Move ${label(name)} ${index + 1} down`} disabled={index === value.length - 1} onClick={() => { const next = [...value]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; onChange(next); }}>↓</button>
          <button type="button" onClick={() => { if (window.confirm("Remove this entry from the section?")) onChange(value.filter((_, itemIndex) => itemIndex !== index)); }}>Remove</button>
        </div></div>
        <Field name={typeof entry === "string" ? name === "paragraphs" ? "paragraph" : "inclusion" : name} value={entry} links={links} onChange={next => onChange(value.map((item, itemIndex) => itemIndex === index ? next : item))} />
      </div>;
    })}<button type="button" className="admin-action" disabled={value.length >= limit} onClick={() => onChange([...value, newItem(name)])}>Add {name === "items" ? "service" : name === "groups" ? "group" : name === "members" ? "team member" : name === "projects" ? "project" : name === "paragraphs" ? "paragraph" : "inclusion"} +</button></fieldset>;
  }
  return <div>{Object.entries(value).filter(([key]) => key !== "id").map(([key, child]) => <Field key={key} name={key} value={child} links={links} onChange={next => onChange({ ...value, [key]: next })} />)}</div>;
}

export function PageSectionEditor({ page, section, initial, initialVisuals, assets, links }: { page: ManagedPage; section: string; initial: unknown; initialVisuals: Record<string, SectionVisualConfig>; assets: MediaAsset[]; links: LinkGroup[] }) {
  const [content, setContent] = useState(initial as Fields);
  const [visuals, setVisuals] = useState(initialVisuals);
  const [library, setLibrary] = useState(assets);
  const [saved, setSaved] = useState(JSON.stringify({ content: initial, visuals: initialVisuals }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const slots = sectionVisualOptions(page, section, content);
  const activeVisuals = Object.fromEntries(Object.entries(visuals).filter(([slot]) => slots.some(item => item.id === slot)));
  const dirty = JSON.stringify({ content, visuals: activeVisuals }) !== saved;
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigate = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor || anchor.getAttribute("target") === "_blank" || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (!window.confirm("Discard unsaved changes to this section?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty]);
  async function save() {
    setBusy(true); setError(""); setMessage("");
    try {
      const parsed = sectionSchema(page, section)!.parse(content);
      const response = await fetch("/api/website-content", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ page, section, content: parsed, visuals: activeVisuals }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save this section.");
      setContent(result.content); setVisuals(result.visuals); setSaved(JSON.stringify({ content: result.content, visuals: result.visuals })); setRevision(current => current + 1); setMessage("Section saved. Changes are live on the website.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this section."); }
    finally { setBusy(false); }
  }
  return <div className={s.root}>
    <fieldset disabled={busy} className={`admin-form ${s.fields}`}><legend>Section content</legend><Field name="section" value={content} links={links} onChange={next => { setContent(next as Fields); setMessage(""); }} /></fieldset>
    {slots.length ? <fieldset disabled={busy} className={s.visuals}><legend>Section visuals</legend><p>Choose media and frame settings below. Content and visuals save together.</p><VisualsEditor key={`${slots.map(slot => slot.id).join(",")}-${revision}`} initial={activeVisuals} slots={slots} assets={library} onAssetSelected={asset => setLibrary(current => [asset, ...current.filter(item => item._id !== asset._id)])} onChange={next => { setVisuals(next); setMessage(""); }} /></fieldset> : null}
    <div className={s.saveBar}>{error ? <p className="form-error" role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}<button type="button" className="admin-button" disabled={busy || !dirty} onClick={() => void save()}>{busy ? "Saving…" : "Save changes"}</button><button type="button" className="admin-action" disabled={busy || !dirty} onClick={() => { if (!window.confirm("Discard unsaved changes to this section?")) return; const previous = JSON.parse(saved); setContent(previous.content); setVisuals(previous.visuals); setRevision(current => current + 1); setError(""); setMessage(""); }}>Discard changes</button><span>{dirty ? "Unsaved changes" : "All changes saved"}</span></div>
  </div>;
}
