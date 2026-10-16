"use client";

import { useEffect, useState } from "react";
import Link from "@/components/link";
import { useTask } from "@/components/loading/navigation";
import { LinkPicker } from "@/components/link-picker";
import type { LinkGroup } from "@/lib/link-options";
import type { HomepageContent, MediaAsset, SectionVisualConfig } from "@/lib/repo/types";

import { VisualsEditor } from "@/app/admin/visuals/visuals-editor";
import { sectionSlots } from "@/lib/visual-slots";

type VisualMap = Record<string, SectionVisualConfig>;
type CopyKey = keyof HomepageContent;
const sections: { key: CopyKey; label: string; note: string }[] = [
  { key: "hero", label: "Hero", note: "Main heading, buttons and artwork" },
  { key: "marquee", label: "Moving service strip", note: "Scrolling text below the hero" },
  { key: "services", label: "Services", note: "Section heading and service items" },
  { key: "pointOfView", label: "Point of view", note: "Heading and description" },
  { key: "work", label: "Selected work", note: "Section heading; projects are managed in Portfolio" },
  { key: "insights", label: "Insights", note: "Section heading and fallback text" },
  { key: "contact", label: "Contact CTA", note: "Heading and button" },
];

function TextField({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return <label className="admin-field"><span>{label}</span>{multiline
    ? <textarea value={value} onChange={event => onChange(event.target.value)} rows={3} />
    : <input value={value} onChange={event => onChange(event.target.value)} />}</label>;
}

export function HomepageImageEditor({
  initialContent,
  initialSection,
  embedded = false,
  initialVisuals,
  assets,
  links,
  focusSlot,
}: {
  initialContent: HomepageContent;
  initialSection?: keyof HomepageContent;
  embedded?: boolean;
  initialVisuals: VisualMap;
  assets: MediaAsset[];
  /** Choices for the link fields (lib/link-options.ts). */
  links: LinkGroup[];
  /** Supports old admin deep links without exposing retired image controls. */
  focusSlot?: string;
}) {
  const [content, setContent] = useState(initialContent);
  const [visuals, setVisuals] = useState<VisualMap>(initialVisuals);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [savedVisuals, setSavedVisuals] = useState<VisualMap>(initialVisuals);
  const [revision, setRevision] = useState(0);
  const [visualFocus, setVisualFocus] = useState<string>();
  const [activeSection, setActiveSection] = useState<CopyKey | null>(focusSlot ? (focusSlot === "hero" ? "hero" : "work") : initialSection ?? null);
  const [pendingSection, setPendingSection] = useState<CopyKey | null | undefined>(undefined);
  const [activeService, setActiveService] = useState<number | null>(null);
  const [library, setLibrary] = useState(assets);
  const { busy, track } = useTask();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");


  const slots = activeSection ? sectionSlots("home", activeSection) : [];
  const activeVisuals = Object.fromEntries(Object.entries(visuals).filter(([id]) => slots.some(slot => slot.id === id)));
  const savedActiveVisuals = Object.fromEntries(Object.entries(savedVisuals).filter(([id]) => slots.some(slot => slot.id === id)));
  const dirty = activeSection !== null && (JSON.stringify(content[activeSection]) !== JSON.stringify(savedContent[activeSection]) || JSON.stringify(activeVisuals) !== JSON.stringify(savedActiveVisuals));

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const guardLinks = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link || link.getAttribute("target") === "_blank") return;
      event.preventDefault();
      event.stopPropagation();
      setError(embedded ? "Save or discard your changes before switching sections." : "Save this section first, or use Back to discard your changes.");
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLinks, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", guardLinks, true); };
  }, [dirty, embedded]);

  function openSection(section: CopyKey | null) {
    if (busy) return;
    if (dirty && section !== activeSection) { setPendingSection(section); return; }
    setActiveSection(section);
    setActiveService(null);
    setError("");
    setMessage("");
  }

  function discardAndOpen() {
    if (activeSection) {
      setContent(current => ({ ...current, [activeSection]: savedContent[activeSection] }));
      setVisuals(savedVisuals); setRevision(current => current + 1);
    }
    const next = pendingSection ?? null;
    setPendingSection(undefined);
    setActiveSection(next);
    setActiveService(null);
    setError("");
    setMessage("");
  }

  function updateSection<K extends CopyKey>(section: K, patch: Partial<HomepageContent[K]>) {
    setContent(current => ({ ...current, [section]: { ...current[section], ...patch } }));
  }

  function saveSection(nextSection?: CopyKey | null) {
    if (!activeSection || busy) return;
    const section = activeSection;
    const sectionContent = content[section];
    const sectionVisuals = activeVisuals;
    return track(async () => {
      setMessage("");
      setError("");
      try {
        const response = await fetch("/api/homepage/section", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section, content: sectionContent, visuals: sectionVisuals }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not save the section.");
        const savedSectionContent = result.content as HomepageContent[typeof section];
        setContent(current => ({ ...current, [section]: savedSectionContent }));
        setSavedContent(current => ({ ...current, [section]: savedSectionContent }));
        setVisuals(current => ({ ...current, ...result.visuals }));
        setSavedVisuals(current => ({ ...current, ...result.visuals }));
        setRevision(current => current + 1);
        if (nextSection !== undefined) {
          setPendingSection(undefined);
          setActiveSection(nextSection);
          setActiveService(null);
        } else {
          setMessage(`${sections.find(item => item.key === section)?.label ?? "Section"} saved.`);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save the section.");
        setPendingSection(undefined);
      }
    });
  }

  return <>
    {!activeSection ? <section className="admin-panel homepage-section-overview">
      <h2>Homepage sections</h2>
      <p>Choose Edit on the section you want to change.</p>
      <Link className="admin-action" href="/admin/visuals">Manage section patterns, images, GIFs and videos →</Link>
      <nav aria-label="Homepage sections">{sections.map(section => <button type="button" key={section.key} onClick={() => openSection(section.key)}>
        <span><strong>{section.label}</strong><small>{section.note}</small></span><b>Edit →</b>
      </button>)}</nav>
    </section> : <>

    <div className="homepage-editor-bar">
      {!embedded && <button className="admin-action" type="button" onClick={() => openSection(null)}>← All sections</button>}
      <h2>{sections.find(item => item.key === activeSection)?.label}</h2>
      {dirty ? <span className="homepage-dirty">Unsaved changes</span> : null}
    </div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {message ? <p className="status status-live" role="status">{message}</p> : null}
    <fieldset className="homepage-editor-fields" disabled={busy}>
    <section className="admin-form homepage-copy-form">
      <p className="field-hint">The current website content is filled in here.</p>

      {activeSection === "hero" ? <section className="admin-seo"><h2>Hero</h2>
        <TextField label="Eyebrow" value={content.hero.eyebrow} onChange={value => updateSection("hero", { eyebrow: value })} />
        <div className="form-columns">
          <TextField label="Heading — before italic word" value={content.hero.headingBefore} onChange={value => updateSection("hero", { headingBefore: value })} />
          <TextField label="Heading — italic word" value={content.hero.headingEmphasis} onChange={value => updateSection("hero", { headingEmphasis: value })} />
        </div>
        <TextField label="Heading — after italic word" value={content.hero.headingAfter} onChange={value => updateSection("hero", { headingAfter: value })} />
        <TextField label="Description" multiline value={content.hero.description} onChange={value => updateSection("hero", { description: value })} />
        <div className="form-columns">
          <TextField label="Main button label" value={content.hero.primaryLabel} onChange={value => updateSection("hero", { primaryLabel: value })} />
          <LinkPicker label="Main button link" groups={links} value={content.hero.primaryHref} onChange={value => updateSection("hero", { primaryHref: value })} />
        </div>
        <div className="form-columns">
          <TextField label="Second link label" value={content.hero.secondaryLabel} onChange={value => updateSection("hero", { secondaryLabel: value })} />
          <LinkPicker label="Second link destination" groups={links} value={content.hero.secondaryHref} onChange={value => updateSection("hero", { secondaryHref: value })} />
        </div>
        <div className="form-columns">
          <TextField label="Hero artwork label" value={content.hero.signalLabel} onChange={value => updateSection("hero", { signalLabel: value })} />
          <TextField label="Hero artwork number (left)" value={content.hero.signalPrimary} onChange={value => updateSection("hero", { signalPrimary: value })} />
        </div>
        <TextField label="Hero artwork number (right)" value={content.hero.signalSecondary} onChange={value => updateSection("hero", { signalSecondary: value })} />
      </section> : null}

      {activeSection === "marquee" ? <section className="admin-seo"><h2>Moving service strip</h2>
        <div className="form-columns">{content.marquee.map((item, index) => <TextField key={index} label={`Moving service text ${index + 1}`} value={item} onChange={value => setContent(current => ({ ...current, marquee: current.marquee.map((text, itemIndex) => itemIndex === index ? value : text) }))} />)}</div>
      </section> : null}

      {activeSection === "services" ? <section className="admin-seo"><h2>Services section heading</h2>
        <p className="field-hint">These names and summaries show on the homepage. The existing service page links stay fixed.</p>
        <TextField label="Eyebrow" value={content.services.eyebrow} onChange={value => updateSection("services", { eyebrow: value })} />
        <TextField label="Side note" multiline value={content.services.sideNote} onChange={value => updateSection("services", { sideNote: value })} />
        <div className="form-columns">
          <TextField label="Heading — before italic word" value={content.services.headingBefore} onChange={value => updateSection("services", { headingBefore: value })} />
          <TextField label="Heading — italic word" value={content.services.headingEmphasis} onChange={value => updateSection("services", { headingEmphasis: value })} />
        </div>
        <TextField label="Heading — after italic word" value={content.services.headingAfter} onChange={value => updateSection("services", { headingAfter: value })} />
        <div className="homepage-item-list">{content.services.items.map((service, index) => <button type="button" key={service.slug} aria-expanded={activeService === index} onClick={() => setActiveService(current => current === index ? null : index)}><span>0{index + 1} · {service.title}</span><b>{activeService === index ? "Close" : "Edit →"}</b></button>)}</div>
        {activeService !== null ? <section className="homepage-case-fields"><h3>Service 0{activeService + 1}</h3>
          {(() => { const index = activeService; const service = content.services.items[index]; return <>
          <TextField label="Service name" value={service.title} onChange={value => setContent(current => ({ ...current, services: { ...current.services, items: current.services.items.map((item, itemIndex) => itemIndex === index ? { ...item, title: value } : item) } }))} />
          <TextField label="Short description" multiline value={service.description} onChange={value => setContent(current => ({ ...current, services: { ...current.services, items: current.services.items.map((item, itemIndex) => itemIndex === index ? { ...item, description: value } : item) } }))} />
          </>; })()}
        </section> : null}
      </section> : null}

      {activeSection === "pointOfView" ? <section className="admin-seo"><h2>Point of view</h2>
        <TextField label="Eyebrow" value={content.pointOfView.eyebrow} onChange={value => updateSection("pointOfView", { eyebrow: value })} />
        <TextField label="First heading line" value={content.pointOfView.headingLineOne} onChange={value => updateSection("pointOfView", { headingLineOne: value })} />
        <div className="form-columns">
          <TextField label="Second line — before italic word" value={content.pointOfView.headingBefore} onChange={value => updateSection("pointOfView", { headingBefore: value })} />
          <TextField label="Italic word" value={content.pointOfView.headingEmphasis} onChange={value => updateSection("pointOfView", { headingEmphasis: value })} />
        </div>
        <TextField label="Second line — after italic word" value={content.pointOfView.headingAfter} onChange={value => updateSection("pointOfView", { headingAfter: value })} />
        <TextField label="Description" multiline value={content.pointOfView.description} onChange={value => updateSection("pointOfView", { description: value })} />
      </section> : null}

      {activeSection === "work" ? <section className="admin-seo"><h2>Selected work</h2>
        <TextField label="Eyebrow" value={content.work.eyebrow} onChange={value => updateSection("work", { eyebrow: value })} />
        <div className="form-columns">
          <TextField label="View-all link label" value={content.work.allLabel} onChange={value => updateSection("work", { allLabel: value })} />
          <TextField label="Heading — before italic word" value={content.work.headingBefore} onChange={value => updateSection("work", { headingBefore: value })} />
        </div>
        <div className="form-columns">
          <TextField label="Heading — italic word" value={content.work.headingEmphasis} onChange={value => updateSection("work", { headingEmphasis: value })} />
          <TextField label="Heading — after italic word" value={content.work.headingAfter} onChange={value => updateSection("work", { headingAfter: value })} />
        </div>
        <p><Link className="admin-action" href="/admin/portfolio">Manage project images and details →</Link></p>
      </section> : null}

      {activeSection === "insights" ? <section className="admin-seo"><h2>Insights</h2>
        <p className="field-hint">Insight cards come from blog posts automatically; edit the section heading and link here.</p>
        <TextField label="Eyebrow" value={content.insights.eyebrow} onChange={value => updateSection("insights", { eyebrow: value })} />
        <div className="form-columns">
          <TextField label="All-posts link label" value={content.insights.allLabel} onChange={value => updateSection("insights", { allLabel: value })} />
          <TextField label="Heading — before italic word" value={content.insights.headingBefore} onChange={value => updateSection("insights", { headingBefore: value })} />
        </div>
        <div className="form-columns">
          <TextField label="Heading — italic word" value={content.insights.headingEmphasis} onChange={value => updateSection("insights", { headingEmphasis: value })} />
          <TextField label="Heading — after italic word" value={content.insights.headingAfter} onChange={value => updateSection("insights", { headingAfter: value })} />
        </div>
        <div className="form-columns">
          <TextField label="No-image card — first line" value={content.insights.fallbackLineOne} onChange={value => updateSection("insights", { fallbackLineOne: value })} />
          <TextField label="No-image card — second line" value={content.insights.fallbackLineTwo} onChange={value => updateSection("insights", { fallbackLineTwo: value })} />
        </div>
        <Link className="admin-action" href="/admin/blogs">Manage blog posts ↗</Link>
      </section> : null}

      {activeSection === "contact" ? <section className="admin-seo"><h2>Contact CTA</h2>
        <TextField label="Eyebrow" value={content.contact.eyebrow} onChange={value => updateSection("contact", { eyebrow: value })} />
        <TextField label="Heading — first line" value={content.contact.headingLineOne} onChange={value => updateSection("contact", { headingLineOne: value })} />
        <div className="form-columns">
          <TextField label="Heading — italic line" value={content.contact.headingEmphasis} onChange={value => updateSection("contact", { headingEmphasis: value })} />
          <TextField label="Button label" value={content.contact.buttonLabel} onChange={value => updateSection("contact", { buttonLabel: value })} />
        </div>
        <LinkPicker label="Button destination" groups={links} value={content.contact.buttonHref} onChange={value => updateSection("contact", { buttonHref: value })} />
      </section> : null}
    </section>

    {slots.length ? <VisualsEditor key={activeSection + "-" + revision} initial={activeVisuals} slots={slots} assets={library} links={links} focusSlot={visualFocus} onSlotSelected={setVisualFocus} onAssetSelected={asset => setLibrary(current => [asset, ...current.filter(item => item._id !== asset._id)])} onChange={next => { setVisuals(current => ({ ...current, ...next })); setMessage(""); }} /> : null}
    </fieldset>

    <div className="homepage-save-bar">{embedded ? <button className="admin-action" type="button" disabled={busy || !dirty} onClick={() => { setContent(savedContent); setVisuals(savedVisuals); setRevision(current => current + 1); setError(""); setMessage(""); }}>Discard changes</button> : <button className="admin-action" type="button" disabled={busy} onClick={() => openSection(null)}>Back</button>}<button className="admin-button" type="button" disabled={busy || !dirty} onClick={() => void saveSection()}>{busy ? "Saving…" : `Save ${sections.find(item => item.key === activeSection)?.label ?? "section"}`}</button></div>
    </>}
    {pendingSection !== undefined ? <div className="homepage-unsaved-backdrop" role="presentation"><div className="homepage-unsaved-dialog" role="dialog" aria-modal="true" aria-labelledby="homepage-unsaved-title"><h2 id="homepage-unsaved-title">Unsaved changes</h2><p>Your changes to this section are not saved yet. What would you like to do?</p><div><button className="admin-button" type="button" disabled={busy} onClick={() => void saveSection(pendingSection)}>Save and continue</button><button className="admin-action" type="button" disabled={busy} onClick={discardAndOpen}>Discard changes</button><button className="admin-action" type="button" disabled={busy} onClick={() => setPendingSection(undefined)}>Continue editing</button></div></div></div> : null}
  </>;
}
