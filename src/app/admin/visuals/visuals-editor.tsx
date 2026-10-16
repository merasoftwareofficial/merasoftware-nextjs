"use client";

import { useState } from "react";
import { ImageChooser, imageSourcesFor } from "@/components/image-chooser";
import { VisualFrameEditor } from "./visual-frame-editor";
import { DEFAULT_CROP, recommendedFrame, resolveFrame } from "@/lib/visual-layout";
import { VISUAL_SLOTS, defaultVisual, slotInfo, type VisualSlotId, type VisualSlotInfo } from "@/lib/visual-slots";
import { VISUAL_PATTERN_DETAILS, VISUAL_PATTERN_IDS } from "@/lib/visual-patterns";
import type { MediaAsset, SectionVisualConfig } from "@/lib/repo/types";
import { externalVisualAsset, mergeVisual } from "@/lib/visual-config";
import { LinkPicker } from "@/components/link-picker";
import type { LinkGroup } from "@/lib/link-options";

type Configs = Record<string, SectionVisualConfig>;

export function VisualsEditor({ initial, assets, focusSlot, slots = [...VISUAL_SLOTS], onChange, onAssetSelected, onSlotSelected, links }: { initial: Configs; assets: MediaAsset[]; focusSlot?: string; slots?: VisualSlotInfo[]; onChange?: (configs: Configs) => void; onAssetSelected?: (asset: MediaAsset) => void; onSlotSelected?: (slot: string) => void; links?: LinkGroup[] }) {
  const [selected, setSelected] = useState<VisualSlotId>(() => (slots.find(item => item.id === focusSlot)?.id ?? slots[0].id) as VisualSlotId);
  const [configs, setConfigs] = useState<Configs>(initial);
  const [saved, setSaved] = useState<Configs>(initial);
  const [library, setLibrary] = useState(assets);
  const [chooser, setChooser] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const slot = slots.find(item => item.id === selected) ?? slotInfo(selected)!;
  const config = mergeVisual(selected, configs[selected]);
  const asset = library.find(item => item._id === config.assetId) ?? externalVisualAsset(config);
  const card = { ...defaultVisual(selected).card!, ...config.card };
  const dirty = JSON.stringify(config) !== JSON.stringify(mergeVisual(selected, saved[selected]));

  function update(patch: Partial<SectionVisualConfig>) {
    const next = { ...configs, [selected]: mergeVisual(selected, { ...config, ...patch }) };
    setConfigs(next);
    onChange?.(next);
    setMessage("");
  }

  function select(next: VisualSlotId) {
    if (next === selected) return;
    if (onChange) { setSelected(next); onSlotSelected?.(next); setError(""); setMessage(""); return; }
    if (dirty && !window.confirm("Discard unsaved changes to this visual?")) return;
    setConfigs(current => ({ ...current, [selected]: saved[selected] ?? defaultVisual(selected) }));
    setSelected(next);
    setError("");
    setMessage("");
  }

  async function save() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/visuals", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ slot: selected, config }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save this visual.");
      setConfigs(current => ({ ...current, [selected]: result as SectionVisualConfig }));
      setSaved(current => ({ ...current, [selected]: result as SectionVisualConfig }));
      setMessage(`${slot.page} → ${slot.label} saved.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this visual."); }
    finally { setBusy(false); }
  }

  return <div className="visuals-admin">
    <aside className="visuals-slot-list" aria-label="Website visual slots">
      {slots.map((item, index) => <div key={item.id}>
        {index === 0 || slots[index - 1].page !== item.page ? <h2>{item.page}</h2> : null}
        <button type="button" aria-current={selected === item.id ? "true" : undefined} onClick={() => select(item.id)}>{item.label}</button>
      </div>)}
    </aside>
    <section className="admin-form visuals-fields" aria-labelledby="visuals-title">
      <h2 id="visuals-title">{slot.page} → {slot.label}</h2>
      <p className="field-hint">Choose media, set the frame size, then adjust its crop. Add a pattern behind the media if needed.</p>
      <div className="visuals-mode" role="group" aria-label="Display mode">
        {(["pattern", "media", "both"] as const).map(mode => <button key={mode} type="button" aria-pressed={config.mode === mode} disabled={mode !== "pattern" && !asset} onClick={() => update({ mode })}>{mode === "both" ? "Pattern + media" : mode === "media" ? "Media only" : "Pattern only"}</button>)}
      </div>
      <div className="visuals-media-actions">
        <button className="admin-button" type="button" onClick={() => setChooser(true)}>{asset ? "Change media" : "Choose image, GIF or MP4"}</button>
        {asset ? <button className="admin-action" type="button" onClick={() => update({ assetId: undefined, externalMedia: undefined, previewLink: undefined, legacyLayout: undefined, mode: "pattern", alt: "", ...(config.frameShape === "source" ? { frameShape: "slot" as const } : {}) })}>Remove media</button> : null}
      </div>
      {asset ? <>
        <p className="field-hint">Selected: {config.externalMedia ? "External image" : `${asset.format.toUpperCase()} · ${asset.width} × ${asset.height} px`}. Videos play muted and loop without controls.</p>
        {config.externalMedia ? <label className="admin-field"><span>Image URL</span><input type="url" value={config.externalMedia.url} onChange={event => update({ externalMedia: { url: event.target.value, width: 0, height: 0 } })} /></label> : null}
        <label className="admin-field"><span>Accessible description</span><input id="visual-alt" value={config.alt} maxLength={300} onChange={event => update({ alt: event.target.value })} placeholder="Describe the visual" /></label>
      </> : null}
      {config.previewLink ? <div className="form-columns">{links ? <LinkPicker label="Preview destination" groups={links} value={config.previewLink.href} onChange={href => update({ previewLink: { ...config.previewLink!, href } })} /> : <label className="admin-field"><span>Preview destination</span><input value={config.previewLink.href} onChange={event => update({ previewLink: { ...config.previewLink!, href: event.target.value } })} /></label>}<label className="admin-field"><span>Preview caption</span><input value={config.previewLink.caption} onChange={event => update({ previewLink: { ...config.previewLink!, caption: event.target.value } })} /></label></div> : null}
      <VisualFrameEditor key={selected} config={config} asset={asset} slotId={selected} label={slot.label} update={update} />
      {config.mode !== "media" ? <div className="form-columns">
        <label className="admin-field"><span>Pattern design (20 choices)</span><select value={config.pattern} onChange={event => update({ pattern: event.target.value as SectionVisualConfig["pattern"] })}>{VISUAL_PATTERN_IDS.map(pattern => <option key={pattern} value={pattern === "flow" && config.pattern === "default" ? "default" : pattern}>{VISUAL_PATTERN_DETAILS[pattern].label}</option>)}</select><small className="field-hint">{config.pattern === "default" ? "Ideas and actions working together." : VISUAL_PATTERN_DETAILS[config.pattern].description}</small></label>
        <label className="admin-field"><span>Pattern intensity: {config.intensity}%</span><input type="range" min="0" max="100" value={config.intensity} onChange={event => update({ intensity: Number(event.target.value) })} /></label>
      </div> : null}
      <fieldset className="admin-field visual-card-editor"><legend>Optional information card</legend>
        <label><input type="checkbox" checked={card.enabled} onChange={event => update({ card: { ...card, enabled: event.target.checked } })} /> Show a card with this section</label>
        {card.enabled ? <>
          <label className="admin-field"><span>Placement</span><select value={card.placement} onChange={event => update({ card: { ...card, placement: event.target.value as "overlay" | "below" } })}><option value="overlay">Over the frame</option><option value="below">Below the frame (good for longer text)</option></select></label>
          <div className="form-columns">
            <label className="admin-field"><span>Small heading</span><input maxLength={100} value={card.eyebrow} onChange={event => update({ card: { ...card, eyebrow: event.target.value } })} /></label>
            <label className="admin-field"><span>Main heading</span><input maxLength={180} value={card.title} onChange={event => update({ card: { ...card, title: event.target.value } })} /></label>
            <label className="admin-field"><span>Number or short text (single line)</span><input maxLength={40} value={card.indexText} onChange={event => update({ card: { ...card, indexText: event.target.value } })} /></label>
          </div>
          <label className="admin-field"><span>Details (any length; long text grows the card)</span><textarea maxLength={1200} rows={4} value={card.body} onChange={event => update({ card: { ...card, body: event.target.value } })} /></label>
          <div className="form-columns visual-card-colors">{([ ["background", "Card background"], ["foreground", "Text"], ["accent", "Accent"] ] as const).map(([key, label]) => <label className="admin-field" key={key}><span>{label}</span><input type="color" value={card[key]} onChange={event => update({ card: { ...card, [key]: event.target.value } })} /></label>)}</div>
        </> : null}
      </fieldset>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {onChange ? <p className="field-hint">Save this section to apply its visual changes.</p> : <button className="admin-button" type="button" disabled={busy || !dirty} onClick={() => void save()}>{busy ? "Saving…" : "Save visual"}</button>}
    </section>
    {chooser ? <ImageChooser sources={imageSourcesFor("editor", { allowUrl: false })} allowVideo onClose={() => setChooser(false)} onChoose={choice => {
      setChooser(false);
      if (choice.kind !== "library") return;
      onAssetSelected?.(choice.asset);
      setLibrary(current => [choice.asset, ...current.filter(item => item._id !== choice.asset._id)]);
      update({ assetId: choice.asset._id, externalMedia: undefined, legacyLayout: undefined, alt: choice.asset.altText, mode: "media", fit: "cover", focalX: 50, focalY: 50, frame: config.frame ?? (config.frameShape === "source" ? recommendedFrame(selected) : resolveFrame(config, selected)), frameShape: "slot", crop: { ...DEFAULT_CROP } });
    }} /> : null}
  </div>;
}
