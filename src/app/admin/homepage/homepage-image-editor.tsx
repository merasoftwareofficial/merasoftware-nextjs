"use client";
/* eslint @next/next/no-img-element: off -- Cloudinary URLs are not configured for next/image. */

import { useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "@/components/link";
import { useTask } from "@/components/loading/navigation";
import { MAX_BROWSER_UPLOAD_BYTES } from "@/lib/cloudinary-types";
import type { HomeImageSlot, HomepageContent, HomepageImage, MediaAsset } from "@/lib/repo/types";

type ImageMap = Partial<Record<HomeImageSlot, HomepageImage>>;
type CopyKey = keyof HomepageContent;

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
  { key: "hero", label: "Hero artwork", note: "Homepage ka hero visual. Current design image ko rounded shape mein dikhata hai.", recommended: "1200 × 900 px", minWidth: 1048, minHeight: 788, desktopRatio: "524 / 394", mobileRatio: "322 / 244" },
  { key: "work-northstar", label: "Northstar Advisory", note: "Homepage ke pehle selected-work card ke liye.", recommended: "1200 × 900 px", minWidth: 1160, minHeight: 730, desktopRatio: "580 / 365", mobileRatio: "358 / 270" },
  { key: "work-oasis", label: "Oasis Living", note: "Homepage ke doosre selected-work card ke liye.", recommended: "1200 × 900 px", minWidth: 1160, minHeight: 730, desktopRatio: "580 / 365", mobileRatio: "358 / 270" },
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
}: {
  initialContent: HomepageContent;
  initialImages: ImageMap;
  assets: MediaAsset[];
}) {
  const [content, setContent] = useState(initialContent);
  const [images, setImages] = useState<ImageMap>(initialImages);
  const [library, setLibrary] = useState(assets);
  const [pendingUpload, setPendingUpload] = useState<{ slot: HomeImageSlot; file: File; width: number; height: number } | null>(null);
  const cropDrag = useRef<{ slot: HomeImageSlot; pointerId: number; startX: number; startY: number; focalX: number; focalY: number; overflowX: number; overflowY: number } | null>(null);
  const { busy, track } = useTask();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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

  function choose(slot: HomeImageSlot, assetId: string) {
    if (!assetId) {
      setImages(current => {
        const next = { ...current };
        delete next[slot];
        return next;
      });
      return;
    }
    const asset = library.find(item => item._id === assetId);
    update(slot, { assetId, alt: asset?.altText ?? "" });
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

  async function uploadForSlot(slot: HomeImageSlot, file: File) {
    setError("");
    setMessage("");
    if (!file.type.startsWith("image/")) return setError("Choose an image file.");
    if (!file.size || file.size > MAX_BROWSER_UPLOAD_BYTES) return setError("Choose an image up to 4 MB.");

    await track(async () => {
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("altText", images[slot]?.alt ?? "");
        const response = await fetch("/api/media/upload", { method: "POST", body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Upload failed.");
        const { asset, reused } = result as { asset: MediaAsset; reused: boolean };
        setLibrary(current => [asset, ...current.filter(item => item._id !== asset._id)]);
        setImages(current => ({ ...current, [slot]: { assetId: asset._id, alt: asset.altText, focalX: 50, focalY: 50 } }));
        setMessage(reused ? "Image pehle se library mein thi; wahi reuse hui." : "Image library mein upload hui aur is slot ke liye select ho gayi.");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Upload failed.");
      }
    });
  }

  async function chooseUpload(slot: HomeImageSlot, file: File) {
    setError("");
    setMessage("");
    setPendingUpload(null);
    if (!file.type.startsWith("image/")) return setError("Choose an image file.");
    if (!file.size || file.size > MAX_BROWSER_UPLOAD_BYTES) return setError("Choose an image up to 4 MB.");

    try {
      const bitmap = await createImageBitmap(file);
      const { width, height } = bitmap;
      bitmap.close();
      const guidance = imageSlots.find(item => item.key === slot);
      if (guidance && (width < guidance.minWidth || height < guidance.minHeight)) {
        setPendingUpload({ slot, file, width, height });
        return;
      }
      await uploadForSlot(slot, file);
    } catch {
      setError("Image ka size read nahi ho saka. JPG, PNG, WebP, GIF ya AVIF image choose karein.");
    }
  }

  function saveContent() {
    return track(async () => {
      setMessage("");
      setError("");
      try {
        const response = await fetch("/api/homepage/content", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(content),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Homepage content save nahi hua.");
        setContent(result as HomepageContent);
        setMessage("Homepage content save ho gaya.");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Homepage content save nahi hua.");
      }
    });
  }

  function saveImages() {
    return track(async () => {
      setMessage("");
      setError("");
      try {
        const response = await fetch("/api/homepage/images", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(imageSlots.map(({ key }) => [key, images[key] ?? null]))),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Homepage images save nahi hui.");
        setImages(result as ImageMap);
        setMessage("Homepage images save ho gayi.");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Homepage images save nahi hui.");
      }
    });
  }

  return <>
    <section className="admin-panel homepage-section-overview">
      <h2>Homepage sections</h2>
      <p>Section par click karke uska current text ya image edit karein. Website ka layout yahin se nahi badlega.</p>
      <nav aria-label="Homepage sections">{[
        ["Hero", "#homepage-hero"], ["Services", "#homepage-services"], ["Point of view", "#homepage-point-of-view"],
        ["Selected work", "#homepage-work"], ["Insights", "#homepage-insights"], ["Contact CTA", "#homepage-contact"], ["Images", "#homepage-images"],
      ].map(([label, href]) => <a href={href} key={href}>{label} <span>↓</span></a>)}</nav>
    </section>

    <section className="admin-form homepage-copy-form">
      <div className="homepage-image-heading"><div><h2>Homepage content</h2><p>Fields mein abhi website par maujood original content bhara hai.</p></div></div>

      <section className="admin-seo" id="homepage-hero"><h2>Hero</h2>
        <TextField label="Eyebrow" value={content.hero.eyebrow} onChange={value => updateSection("hero", { eyebrow: value })} />
        <div className="form-columns">
          <TextField label="Heading — before italic word" value={content.hero.headingBefore} onChange={value => updateSection("hero", { headingBefore: value })} />
          <TextField label="Heading — italic word" value={content.hero.headingEmphasis} onChange={value => updateSection("hero", { headingEmphasis: value })} />
        </div>
        <TextField label="Heading — after italic word" value={content.hero.headingAfter} onChange={value => updateSection("hero", { headingAfter: value })} />
        <TextField label="Description" multiline value={content.hero.description} onChange={value => updateSection("hero", { description: value })} />
        <div className="form-columns">
          <TextField label="Main button label" value={content.hero.primaryLabel} onChange={value => updateSection("hero", { primaryLabel: value })} />
          <TextField label="Main button link" value={content.hero.primaryHref} onChange={value => updateSection("hero", { primaryHref: value })} />
        </div>
        <div className="form-columns">
          <TextField label="Second link label" value={content.hero.secondaryLabel} onChange={value => updateSection("hero", { secondaryLabel: value })} />
          <TextField label="Second link destination" value={content.hero.secondaryHref} onChange={value => updateSection("hero", { secondaryHref: value })} />
        </div>
        <div className="form-columns">
          <TextField label="Hero artwork label" value={content.hero.signalLabel} onChange={value => updateSection("hero", { signalLabel: value })} />
          <TextField label="Hero artwork number (left)" value={content.hero.signalPrimary} onChange={value => updateSection("hero", { signalPrimary: value })} />
        </div>
        <TextField label="Hero artwork number (right)" value={content.hero.signalSecondary} onChange={value => updateSection("hero", { signalSecondary: value })} />
        <div className="form-columns">{content.marquee.map((item, index) => <TextField key={index} label={`Moving service text ${index + 1}`} value={item} onChange={value => setContent(current => ({ ...current, marquee: current.marquee.map((text, itemIndex) => itemIndex === index ? value : text) }))} />)}</div>
      </section>

      <section className="admin-seo" id="homepage-services"><h2>Services section heading</h2>
        <p className="field-hint">These names and summaries show on the homepage. The existing service page links stay fixed.</p>
        <TextField label="Eyebrow" value={content.services.eyebrow} onChange={value => updateSection("services", { eyebrow: value })} />
        <TextField label="Side note" multiline value={content.services.sideNote} onChange={value => updateSection("services", { sideNote: value })} />
        <div className="form-columns">
          <TextField label="Heading — before italic word" value={content.services.headingBefore} onChange={value => updateSection("services", { headingBefore: value })} />
          <TextField label="Heading — italic word" value={content.services.headingEmphasis} onChange={value => updateSection("services", { headingEmphasis: value })} />
        </div>
        <TextField label="Heading — after italic word" value={content.services.headingAfter} onChange={value => updateSection("services", { headingAfter: value })} />
        {content.services.items.map((service, index) => <section className="homepage-case-fields" key={service.slug}><h3>Service 0{index + 1}</h3>
          <TextField label="Service name" value={service.title} onChange={value => setContent(current => ({ ...current, services: { ...current.services, items: current.services.items.map((item, itemIndex) => itemIndex === index ? { ...item, title: value } : item) } }))} />
          <TextField label="Short description" multiline value={service.description} onChange={value => setContent(current => ({ ...current, services: { ...current.services, items: current.services.items.map((item, itemIndex) => itemIndex === index ? { ...item, description: value } : item) } }))} />
        </section>)}
      </section>

      <section className="admin-seo" id="homepage-point-of-view"><h2>Point of view</h2>
        <TextField label="Eyebrow" value={content.pointOfView.eyebrow} onChange={value => updateSection("pointOfView", { eyebrow: value })} />
        <TextField label="First heading line" value={content.pointOfView.headingLineOne} onChange={value => updateSection("pointOfView", { headingLineOne: value })} />
        <div className="form-columns">
          <TextField label="Second line — before italic word" value={content.pointOfView.headingBefore} onChange={value => updateSection("pointOfView", { headingBefore: value })} />
          <TextField label="Italic word" value={content.pointOfView.headingEmphasis} onChange={value => updateSection("pointOfView", { headingEmphasis: value })} />
        </div>
        <TextField label="Second line — after italic word" value={content.pointOfView.headingAfter} onChange={value => updateSection("pointOfView", { headingAfter: value })} />
        <TextField label="Description" multiline value={content.pointOfView.description} onChange={value => updateSection("pointOfView", { description: value })} />
      </section>

      <section className="admin-seo" id="homepage-work"><h2>Selected work</h2>
        <TextField label="Eyebrow" value={content.work.eyebrow} onChange={value => updateSection("work", { eyebrow: value })} />
        <div className="form-columns">
          <TextField label="View-all link label" value={content.work.allLabel} onChange={value => updateSection("work", { allLabel: value })} />
          <TextField label="Heading — before italic word" value={content.work.headingBefore} onChange={value => updateSection("work", { headingBefore: value })} />
        </div>
        <div className="form-columns">
          <TextField label="Heading — italic word" value={content.work.headingEmphasis} onChange={value => updateSection("work", { headingEmphasis: value })} />
          <TextField label="Heading — after italic word" value={content.work.headingAfter} onChange={value => updateSection("work", { headingAfter: value })} />
        </div>
        {content.work.cards.map((card, index) => <section className="homepage-case-fields" key={index}><h3>{card.titleLineOne} {card.titleLineTwo} card</h3>
          <div className="form-columns">
            <TextField label="Category label" value={card.tag} onChange={value => updateCard(index, "tag", value)} />
            <TextField label="Title line 1" value={card.titleLineOne} onChange={value => updateCard(index, "titleLineOne", value)} />
          </div>
          <TextField label="Title line 2" value={card.titleLineTwo} onChange={value => updateCard(index, "titleLineTwo", value)} />
          <TextField label="Short description" multiline value={card.description} onChange={value => updateCard(index, "description", value)} />
        </section>)}
      </section>

      <section className="admin-seo" id="homepage-insights"><h2>Insights</h2>
        <p className="field-hint">Insight cards khud Blog posts se aate hain; yahan section heading aur link edit hote hain.</p>
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
      </section>

      <section className="admin-seo" id="homepage-contact"><h2>Contact CTA</h2>
        <TextField label="Eyebrow" value={content.contact.eyebrow} onChange={value => updateSection("contact", { eyebrow: value })} />
        <TextField label="Heading — first line" value={content.contact.headingLineOne} onChange={value => updateSection("contact", { headingLineOne: value })} />
        <div className="form-columns">
          <TextField label="Heading — italic line" value={content.contact.headingEmphasis} onChange={value => updateSection("contact", { headingEmphasis: value })} />
          <TextField label="Button label" value={content.contact.buttonLabel} onChange={value => updateSection("contact", { buttonLabel: value })} />
        </div>
        <TextField label="Button destination" value={content.contact.buttonHref} onChange={value => updateSection("contact", { buttonHref: value })} />
      </section>

      <div className="form-actions"><button className="admin-button" type="button" disabled={busy} onClick={() => void saveContent()}>{busy ? "Saving…" : "Save homepage content"}</button></div>
    </section>

    <section className="admin-form homepage-image-editor" id="homepage-images">
      <div className="homepage-image-heading">
        <div><h2>Homepage images</h2><p>Original image library mein safe rahegi; yahan sirf website par dikhne wali crop position save hoti hai.</p></div>
        <Link className="admin-action" href="/admin/media">Open media library ↗</Link>
      </div>
      {imageSlots.map(slot => {
        const current = images[slot.key];
        const asset = library.find(item => item._id === current?.assetId);
        const lowResolution = asset && (asset.width < slot.minWidth || asset.height < slot.minHeight);
        return <article className="homepage-image-slot" key={slot.key}>
          <div className="homepage-image-slot-head"><div><h3>{slot.label}</h3><p>{slot.note}</p></div>{current ? <button className="admin-action" type="button" onClick={() => choose(slot.key, "")}>Remove image</button> : null}</div>
          <p className="homepage-image-recommendation"><b>Recommended upload:</b> {slot.recommended}<span> · 4 MB tak</span></p>
          <label className="admin-field"><span>Media Library se image choose karein</span>
            <select value={current?.assetId ?? ""} onChange={event => choose(slot.key, event.target.value)}>
              <option value="">Is section mein image nahi</option>
              {library.map(item => <option value={item._id} key={item._id}>{item.altText || item.publicId.split("/").at(-1) || item.format.toUpperCase()} · {item.width} × {item.height}</option>)}
            </select>
          </label>
          <label className="admin-button homepage-upload-button">Upload new image
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" disabled={busy} onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void chooseUpload(slot.key, file); event.currentTarget.value = ""; }} />
          </label>
          {pendingUpload?.slot === slot.key ? <div className="homepage-low-resolution-confirm" role="alert">
            <p>Selected image {pendingUpload.width} × {pendingUpload.height} px hai. Recommended size {slot.recommended} hai; desktop par image blur ho sakti hai.</p>
            <div><button className="admin-button" type="button" disabled={busy} onClick={() => { const pending = pendingUpload; setPendingUpload(null); void uploadForSlot(pending.slot, pending.file); }}>Phir bhi upload karein</button><button className="admin-action" type="button" onClick={() => setPendingUpload(null)}>Cancel</button></div>
          </div> : null}
          {asset && current ? <>
            <p className={`homepage-image-resolution${lowResolution ? " is-low" : ""}`} role={lowResolution ? "status" : undefined}>
              Selected image: {asset.width} × {asset.height} px. {lowResolution
                ? `Recommended at least ${slot.minWidth} × ${slot.minHeight} px for a sharp desktop display; preview karke decide karein.`
                : "Resolution desktop display ke liye theek hai."}
            </p>
            <div className="homepage-crop-preview">
              <div><span>Desktop preview</span><div className={`homepage-crop-frame${slot.key === "hero" ? " is-hero" : ""}`} style={{ aspectRatio: slot.desktopRatio }} role="application" aria-label={`${slot.label} desktop crop preview. Drag to position, or use arrow keys.`} tabIndex={0} onPointerDown={event => startCrop(event, slot.key, asset, current)} onPointerMove={event => moveCrop(event, slot.key)} onPointerUp={() => { cropDrag.current = null; }} onPointerCancel={() => { cropDrag.current = null; }} onKeyDown={event => keyboardCrop(event, slot.key, current)}>
                {/* Cloudinary originals stay unchanged; object-position controls this placement's visible crop. */}
                <img src={asset.url} alt={current.alt} style={{ objectPosition: `${current.focalX}% ${current.focalY}%` }} />
              </div></div>
              <div><span>Mobile preview</span><div className={`homepage-crop-frame${slot.key === "hero" ? " is-hero" : ""}`} style={{ aspectRatio: slot.mobileRatio }} role="application" aria-label={`${slot.label} mobile crop preview. Drag to position, or use arrow keys.`} tabIndex={0} onPointerDown={event => startCrop(event, slot.key, asset, current)} onPointerMove={event => moveCrop(event, slot.key)} onPointerUp={() => { cropDrag.current = null; }} onPointerCancel={() => { cropDrag.current = null; }} onKeyDown={event => keyboardCrop(event, slot.key, current)}>
                <img src={asset.url} alt={current.alt} style={{ objectPosition: `${current.focalX}% ${current.focalY}%` }} />
              </div></div>
            </div>
            <div className="homepage-image-fields">
              <p className="field-hint">Preview par image ko drag karke crop set karein. Keyboard ke arrow keys bhi kaam karte hain; Shift ke saath zyada move hoga.</p>
              <label className="admin-field"><span>Alt text (image ka accessible description)</span><input value={current.alt} maxLength={300} onChange={event => update(slot.key, { alt: event.target.value })} placeholder="Image mein kya dikh raha hai?" /></label>
              <div className="form-columns">
                <label className="admin-field"><span>Crop position — left / right</span><input type="range" min="0" max="100" value={current.focalX} onChange={event => update(slot.key, { focalX: Number(event.target.value) })} /></label>
                <label className="admin-field"><span>Crop position — up / down</span><input type="range" min="0" max="100" value={current.focalY} onChange={event => update(slot.key, { focalY: Number(event.target.value) })} /></label>
              </div>
            </div>
          </> : <p className="field-hint">Image select karne par desktop aur mobile preview yahan dikhega.</p>}
        </article>;
      })}
      <div className="form-actions"><button className="admin-button" type="button" disabled={busy} onClick={() => void saveImages()}>{busy ? "Saving…" : "Save homepage images"}</button></div>
    </section>

    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {message ? <p className="status status-live" role="status">{message}</p> : null}
  </>;
}
