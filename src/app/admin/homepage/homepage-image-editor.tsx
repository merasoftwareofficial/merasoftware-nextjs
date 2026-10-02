"use client";
/* eslint @next/next/no-img-element: off -- Cloudinary URLs are not configured for next/image. */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "@/components/link";
import { useTask } from "@/components/loading/navigation";
import { ImageChooser, imageSourcesFor } from "@/components/image-chooser";
import { LinkPicker } from "@/components/link-picker";
import { SeoHint, focusSeoField } from "@/components/seo-checks";
import { homepageImageSeoChecks } from "@/lib/seo-rules";
import type { LinkGroup } from "@/lib/link-options";
import type { HomeImageSlot, HomepageContent, HomepageImage, MediaAsset, Role } from "@/lib/repo/types";

type ImageMap = Partial<Record<HomeImageSlot, HomepageImage>>;
type CopyKey = keyof HomepageContent;
const sections: { key: CopyKey; label: string; note: string }[] = [
  { key: "hero", label: "Hero", note: "Main heading, buttons and artwork" },
  { key: "marquee", label: "Moving service strip", note: "Scrolling text below the hero" },
  { key: "services", label: "Services", note: "Section heading and service items" },
  { key: "pointOfView", label: "Point of view", note: "Heading and description" },
  { key: "work", label: "Selected work", note: "Project cards and their images" },
  { key: "insights", label: "Insights", note: "Section heading and fallback text" },
  { key: "contact", label: "Contact CTA", note: "Heading and button" },
];

const imageSlots: {
  key: HomeImageSlot;
  label: string;
  note: string;
  recommended: string;
  minWidth: number;
  minHeight: number;
  desktopRatio: string;
  mobileRatio: string;
}[] = [
  { key: "hero", label: "Hero artwork", note: "The homepage hero visual. With an image, the photo fills a rounded card and the pattern steps back; without one, the pattern shows on its own.", recommended: "1200 × 900 px", minWidth: 1048, minHeight: 788, desktopRatio: "524 / 394", mobileRatio: "322 / 244" },
  { key: "work-northstar", label: "Northstar Advisory", note: "For the first selected-work card on the homepage.", recommended: "1200 × 900 px", minWidth: 1160, minHeight: 730, desktopRatio: "580 / 365", mobileRatio: "358 / 270" },
  { key: "work-oasis", label: "Oasis Living", note: "For the second selected-work card on the homepage.", recommended: "1200 × 900 px", minWidth: 1160, minHeight: 730, desktopRatio: "580 / 365", mobileRatio: "358 / 270" },
];

function TextField({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return <label className="admin-field"><span>{label}</span>{multiline
    ? <textarea value={value} onChange={event => onChange(event.target.value)} rows={3} />
    : <input value={value} onChange={event => onChange(event.target.value)} />}</label>;
}

export function HomepageImageEditor({
  initialContent,
  initialImages,
  assets,
  links,
  role,
  focusSlot,
}: {
  initialContent: HomepageContent;
  initialImages: ImageMap;
  assets: MediaAsset[];
  /** The signed-in user's role; decides upload/library access in the image chooser. */
  role: Role;
  /** Choices for the link fields (lib/link-options.ts). */
  links: LinkGroup[];
  /** Opens this slot's image settings with its alt text focused ("Fix →" on /admin/seo). */
  focusSlot?: HomeImageSlot;
}) {
  const [content, setContent] = useState(initialContent);
  const [images, setImages] = useState<ImageMap>(initialImages);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [savedImages, setSavedImages] = useState<ImageMap>(initialImages);
  const [activeSection, setActiveSection] = useState<CopyKey | null>(focusSlot ? (focusSlot === "hero" ? "hero" : "work") : null);
  const [pendingSection, setPendingSection] = useState<CopyKey | null | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<"content" | "images">(focusSlot && focusSlot !== "hero" ? "images" : "content");
  const [activeWorkCard, setActiveWorkCard] = useState<number | null>(null);
  const [activeService, setActiveService] = useState<number | null>(null);
  const [activeImageSlot, setActiveImageSlot] = useState<HomeImageSlot | null>(focusSlot ?? null);
  const [chooserSlot, setChooserSlot] = useState<HomeImageSlot | null>(null);
  const [showCrop, setShowCrop] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [library, setLibrary] = useState(assets);
  const cropDrag = useRef<{ slot: HomeImageSlot; pointerId: number; startX: number; startY: number; focalX: number; focalY: number; overflowX: number; overflowY: number } | null>(null);
  const { busy, track } = useTask();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (focusSlot) focusSeoField(`home-image-alt-${focusSlot}`);
  }, [focusSlot]);

  const sectionImageSlots = (section: CopyKey | null) => section === "work" ? ["work-northstar", "work-oasis"] as HomeImageSlot[] : [];
  const dirty = activeSection !== null && (
    JSON.stringify(content[activeSection]) !== JSON.stringify(savedContent[activeSection]) ||
    sectionImageSlots(activeSection).some(slot => JSON.stringify(images[slot] ?? null) !== JSON.stringify(savedImages[slot] ?? null))
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const guardLinks = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link || link.getAttribute("target") === "_blank") return;
      event.preventDefault();
      event.stopPropagation();
      setError("Save this section first, or use Back to discard your changes.");
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLinks, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", guardLinks, true); };
  }, [dirty]);

  function openSection(section: CopyKey | null) {
    if (busy) return;
    if (dirty && section !== activeSection) { setPendingSection(section); return; }
    setActiveSection(section);
    setActiveTab("content");
    setActiveService(null);
    setActiveWorkCard(null);
    setActiveImageSlot(null);
    setChooserSlot(null);
    setShowCrop(false);
    setError("");
    setMessage("");
  }

  function discardAndOpen() {
    if (activeSection) {
      setContent(current => ({ ...current, [activeSection]: savedContent[activeSection] }));
      setImages(current => {
        const next = { ...current };
        for (const slot of sectionImageSlots(activeSection)) {
          if (savedImages[slot]) next[slot] = savedImages[slot];
          else delete next[slot];
        }
        return next;
      });
    }
    const next = pendingSection ?? null;
    setPendingSection(undefined);
    setActiveSection(next);
    setActiveTab("content");
    setActiveService(null);
    setActiveWorkCard(null);
    setActiveImageSlot(null);
    setChooserSlot(null);
    setShowCrop(false);
    setError("");
    setMessage("");
  }

  function updateSection<K extends CopyKey>(section: K, patch: Partial<HomepageContent[K]>) {
    setContent(current => ({ ...current, [section]: { ...current[section], ...patch } }));
  }

  function updateCard(index: number, key: "tag" | "titleLineOne" | "titleLineTwo" | "description", value: string) {
    setContent(current => ({ ...current, work: {
      ...current.work,
      cards: current.work.cards.map((card, cardIndex) => cardIndex === index ? { ...card, [key]: value } : card),
    } }));
  }

  function update(slot: HomeImageSlot, patch: Partial<HomepageImage>) {
    setImages(current => ({ ...current, [slot]: { assetId: "", alt: "", focalX: 50, focalY: 50, ...current[slot], ...patch } }));
  }

  function removeImage(slot: HomeImageSlot) {
    setImages(current => {
      const next = { ...current };
      delete next[slot];
      return next;
    });
  }

  /** A website section takes library images only (no outside URL); see imageSourcesFor. */
  function chooseAsset(slot: HomeImageSlot, asset: MediaAsset, note: string) {
    setLibrary(current => [asset, ...current.filter(item => item._id !== asset._id)]);
    setImages(current => ({ ...current, [slot]: { assetId: asset._id, alt: asset.altText, focalX: 50, focalY: 50 } }));
    setShowCrop(false);
    setError("");
    setMessage(note);
  }

  function startCrop(event: ReactPointerEvent<HTMLDivElement>, slot: HomeImageSlot, asset: MediaAsset, current: HomepageImage) {
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = Math.max(rect.width / asset.width, rect.height / asset.height);
    cropDrag.current = {
      slot, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      focalX: current.focalX, focalY: current.focalY,
      overflowX: Math.max(0, asset.width * scale - rect.width),
      overflowY: Math.max(0, asset.height * scale - rect.height),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveCrop(event: ReactPointerEvent<HTMLDivElement>, slot: HomeImageSlot) {
    const drag = cropDrag.current;
    if (!drag || drag.slot !== slot || drag.pointerId !== event.pointerId) return;
    const focalX = drag.overflowX ? Math.max(0, Math.min(100, drag.focalX - (event.clientX - drag.startX) / drag.overflowX * 100)) : drag.focalX;
    const focalY = drag.overflowY ? Math.max(0, Math.min(100, drag.focalY - (event.clientY - drag.startY) / drag.overflowY * 100)) : drag.focalY;
    update(slot, { focalX, focalY });
  }

  function keyboardCrop(event: ReactKeyboardEvent<HTMLDivElement>, slot: HomeImageSlot, current: HomepageImage) {
    const step = event.shiftKey ? 10 : 2;
    const changes: Partial<HomepageImage> = {};
    if (event.key === "ArrowLeft") changes.focalX = Math.max(0, current.focalX - step);
    else if (event.key === "ArrowRight") changes.focalX = Math.min(100, current.focalX + step);
    else if (event.key === "ArrowUp") changes.focalY = Math.max(0, current.focalY - step);
    else if (event.key === "ArrowDown") changes.focalY = Math.min(100, current.focalY + step);
    else return;
    event.preventDefault();
    update(slot, changes);
  }

  function saveSection(nextSection?: CopyKey | null) {
    if (!activeSection || busy) return;
    const section = activeSection;
    const sectionContent = content[section];
    const sectionImages = Object.fromEntries(sectionImageSlots(section).map(slot => [slot, images[slot] ?? null]));
    return track(async () => {
      setMessage("");
      setError("");
      try {
        const response = await fetch("/api/homepage/section", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section, content: sectionContent, images: sectionImages }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not save the section.");
        const savedSectionContent = result.content as HomepageContent[typeof section];
        setContent(current => ({ ...current, [section]: savedSectionContent }));
        setSavedContent(current => ({ ...current, [section]: savedSectionContent }));
        setImages(result.images as ImageMap);
        setSavedImages(result.images as ImageMap);
        if (nextSection !== undefined) {
          setPendingSection(undefined);
          setActiveSection(nextSection);
          setActiveTab("content");
          setActiveService(null);
          setActiveWorkCard(null);
          setActiveImageSlot(null);
          setChooserSlot(null);
          setShowCrop(false);
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
      <button className="admin-action" type="button" onClick={() => openSection(null)}>← All sections</button>
      <h2>{sections.find(item => item.key === activeSection)?.label}</h2>
      {dirty ? <span className="homepage-dirty">Unsaved changes</span> : null}
    </div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {message ? <p className="status status-live" role="status">{message}</p> : null}
    {sectionImageSlots(activeSection).length ? <div className="homepage-editor-tabs" aria-label="Section editor">
      <button type="button" aria-pressed={activeTab === "content"} onClick={() => setActiveTab("content")}>Content</button>
      <button type="button" aria-pressed={activeTab === "images"} onClick={() => setActiveTab("images")}>Images</button>
    </div> : null}

    <fieldset className="homepage-editor-fields" disabled={busy}>
    {activeTab === "content" ? <section className="admin-form homepage-copy-form">
      <p className="field-hint">The current website content is filled in here.</p>

      {activeSection === "hero" ? <section className="admin-seo"><h2>Hero</h2>
        <p><Link className="admin-action" href="/admin/visuals?slot=home.hero">Edit hero pattern and media →</Link></p>
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
        <div className="homepage-item-list">{content.work.cards.map((card, index) => <button type="button" key={index} aria-expanded={activeWorkCard === index} onClick={() => setActiveWorkCard(current => current === index ? null : index)}><span>{card.titleLineOne} {card.titleLineTwo}</span><b>{activeWorkCard === index ? "Close" : "Edit →"}</b></button>)}</div>
        {activeWorkCard !== null ? <section className="homepage-case-fields"><h3>{content.work.cards[activeWorkCard].titleLineOne} {content.work.cards[activeWorkCard].titleLineTwo} card</h3>
          {(() => { const index = activeWorkCard; const card = content.work.cards[index]; return <>
          <div className="form-columns">
            <TextField label="Category label" value={card.tag} onChange={value => updateCard(index, "tag", value)} />
            <TextField label="Title line 1" value={card.titleLineOne} onChange={value => updateCard(index, "titleLineOne", value)} />
          </div>
          <TextField label="Title line 2" value={card.titleLineTwo} onChange={value => updateCard(index, "titleLineTwo", value)} />
          <TextField label="Short description" multiline value={card.description} onChange={value => updateCard(index, "description", value)} />
          <button className="admin-action" type="button" onClick={() => { setActiveImageSlot(index === 0 ? "work-northstar" : "work-oasis"); setActiveTab("images"); }}>Edit this card image →</button>
          </>; })()}
        </section> : null}
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
    </section> : null}

    {activeTab === "images" && sectionImageSlots(activeSection).length ? <section className="admin-form homepage-image-editor">
      <div className="homepage-image-heading">
        <div><h2>Section images</h2><p>The original image stays unchanged in the library. The crop position is saved with this section.</p></div>
        <Link className="admin-action" href="/admin/media">Open media library ↗</Link>
      </div>
      {imageSlots.filter(slot => sectionImageSlots(activeSection).includes(slot.key)).map(slot => {
        const current = images[slot.key];
        const asset = library.find(item => item._id === current?.assetId);
        const lowResolution = asset && (asset.width < slot.minWidth || asset.height < slot.minHeight);
        return <article className="homepage-image-slot" key={slot.key}>
          {activeSection === "work" ? <button className="homepage-slot-toggle" type="button" aria-expanded={activeImageSlot === slot.key} onClick={() => { setActiveImageSlot(current => current === slot.key ? null : slot.key); setShowCrop(false); setChooserSlot(null); }}><span>{slot.label}</span><b>{activeImageSlot === slot.key ? "Close" : "Edit →"}</b></button> : null}
          {activeSection === "hero" || activeImageSlot === slot.key ? <>
          <div className="homepage-image-slot-head"><div><h3>{slot.label}</h3><p>{slot.note}</p></div>{current ? <button className="admin-action" type="button" onClick={() => removeImage(slot.key)}>Remove image</button> : null}</div>
          <p className="homepage-image-recommendation"><b>Recommended upload:</b> {slot.recommended}<span> · up to 4 MB</span></p>
          {asset ? <img className="homepage-selected-thumb" src={asset.url} alt={current?.alt ?? ""} /> : null}
          <button className="admin-button" type="button" disabled={busy} onClick={() => setChooserSlot(slot.key)}>{current ? "Change image" : "Choose image"}</button>
          {chooserSlot === slot.key ? <ImageChooser
            sources={imageSourcesFor(role, { allowUrl: false })}
            minSize={{ width: slot.minWidth, height: slot.minHeight, recommended: slot.recommended }}
            onClose={() => setChooserSlot(null)}
            onChoose={choice => {
              setChooserSlot(null);
              if (choice.kind !== "library") return;
              chooseAsset(slot.key, choice.asset, choice.reused
                ? "This image was already in the library. It will appear on the website when you save the section."
                : choice.uploaded
                  ? "Image uploaded to the library. It will appear on the website when you save the section."
                  : "Image chosen. It will appear on the website when you save the section.");
            }}
          /> : null}
          {asset && current ? <>
            <p className={`homepage-image-resolution${lowResolution ? " is-low" : ""}`} role={lowResolution ? "status" : undefined}>
              Selected image: {asset.width} × {asset.height} px. {lowResolution
                ? `Recommended at least ${slot.minWidth} × ${slot.minHeight} px for a sharp desktop display; check the preview before you decide.`
                : "The resolution is fine for desktop display."}
            </p>
            <button className="admin-action" type="button" aria-expanded={showCrop} onClick={() => setShowCrop(value => !value)}>{showCrop ? "Close crop controls" : "Adjust crop and preview"}</button>
            <label className="admin-field"><span>Alt text (an accessible description of the image)</span><input id={`home-image-alt-${slot.key}`} value={current.alt} maxLength={300} onChange={event => update(slot.key, { alt: event.target.value })} placeholder="What does the image show?" /><SeoHint checks={homepageImageSeoChecks(current, slot.key)} field="image-alt" /></label>
            {showCrop ? <><p className="field-hint">Desktop and mobile use the same crop position.</p>
            <div className="homepage-device-switch"><button type="button" aria-pressed={previewDevice === "desktop"} onClick={() => setPreviewDevice("desktop")}>Desktop</button><button type="button" aria-pressed={previewDevice === "mobile"} onClick={() => setPreviewDevice("mobile")}>Mobile</button></div>
            <div className="homepage-crop-preview">
              <div><span>{previewDevice === "desktop" ? "Desktop" : "Mobile"} preview</span><div className={`homepage-crop-frame${slot.key === "hero" ? " is-hero" : ""}`} style={{ aspectRatio: previewDevice === "desktop" ? slot.desktopRatio : slot.mobileRatio }} role="application" aria-label={`${slot.label} crop preview. Drag to position, or use arrow keys.`} tabIndex={0} onPointerDown={event => startCrop(event, slot.key, asset, current)} onPointerMove={event => moveCrop(event, slot.key)} onPointerUp={() => { cropDrag.current = null; }} onPointerCancel={() => { cropDrag.current = null; }} onKeyDown={event => keyboardCrop(event, slot.key, current)}>
                {/* Cloudinary originals stay unchanged; object-position controls this placement's visible crop. */}
                <img src={asset.url} alt={current.alt} style={{ objectPosition: `${current.focalX}% ${current.focalY}%` }} />
              </div></div>
            </div>
            <div className="homepage-image-fields">
              <p className="field-hint">Drag the image in the preview to set the crop. The arrow keys also work; hold Shift to move further.</p>
              <div className="form-columns">
                <label className="admin-field"><span>Crop position — left / right</span><input type="range" min="0" max="100" value={current.focalX} onChange={event => update(slot.key, { focalX: Number(event.target.value) })} /></label>
                <label className="admin-field"><span>Crop position — up / down</span><input type="range" min="0" max="100" value={current.focalY} onChange={event => update(slot.key, { focalY: Number(event.target.value) })} /></label>
              </div>
            </div></> : null}
          </> : <p className="field-hint">Select an image to see its desktop and mobile preview here.</p>}
          </> : null}
        </article>;
      })}
    </section> : null}
    </fieldset>

    <div className="homepage-save-bar"><button className="admin-action" type="button" disabled={busy} onClick={() => openSection(null)}>Back</button><button className="admin-button" type="button" disabled={busy || !dirty} onClick={() => void saveSection()}>{busy ? "Saving…" : `Save ${sections.find(item => item.key === activeSection)?.label ?? "section"}`}</button></div>
    </>}
    {pendingSection !== undefined ? <div className="homepage-unsaved-backdrop" role="presentation"><div className="homepage-unsaved-dialog" role="dialog" aria-modal="true" aria-labelledby="homepage-unsaved-title"><h2 id="homepage-unsaved-title">Unsaved changes</h2><p>Your changes to this section are not saved yet. What would you like to do?</p><div><button className="admin-button" type="button" disabled={busy} onClick={() => void saveSection(pendingSection)}>Save and continue</button><button className="admin-action" type="button" disabled={busy} onClick={discardAndOpen}>Discard changes</button><button className="admin-action" type="button" disabled={busy} onClick={() => setPendingSection(undefined)}>Continue editing</button></div></div></div> : null}
  </>;
}
