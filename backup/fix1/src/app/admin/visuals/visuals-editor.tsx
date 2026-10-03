"use client";

import { useState } from "react";
import { ImageChooser, imageSourcesFor } from "@/components/image-chooser";
import { SectionVisual } from "@/components/section-visual";
import { VISUAL_SLOTS, defaultVisual, slotInfo, type VisualSlotId } from "@/lib/visual-slots";
import { VISUAL_PATTERN_DETAILS, VISUAL_PATTERN_IDS } from "@/lib/visual-patterns";
import type { MediaAsset, SectionVisualConfig } from "@/lib/repo/types";

type Configs = Record<string, SectionVisualConfig>;

export function VisualsEditor({ initial, assets, focusSlot }: { initial: Configs; assets: MediaAsset[]; focusSlot?: string }) {
  const [selected, setSelected] = useState<VisualSlotId>(() => (slotInfo(focusSlot ?? "")?.id ?? VISUAL_SLOTS[0].id) as VisualSlotId);
  const [configs, setConfigs] = useState<Configs>(initial);
  const [saved, setSaved] = useState<Configs>(initial);
  const [library, setLibrary] = useState(assets);
  const [chooser, setChooser] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const slot = slotInfo(selected)!;
  const config = { ...defaultVisual(selected), ...configs[selected] };
  const asset = library.find(item => item._id === config.assetId);
  const card = { ...defaultVisual(selected).card!, ...config.card };
  const dirty = JSON.stringify(config) !== JSON.stringify({ ...defaultVisual(selected), ...saved[selected] });

  function update(patch: Partial<SectionVisualConfig>) {
    setConfigs(current => ({ ...current, [selected]: { ...defaultVisual(selected), ...current[selected], ...patch } }));
    setMessage("");
  }

  function select(next: VisualSlotId) {
    if (next === selected) return;
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
      {VISUAL_SLOTS.map((item, index) => <div key={item.id}>
        {index === 0 || VISUAL_SLOTS[index - 1].page !== item.page ? <h2>{item.page}</h2> : null}
        <button type="button" aria-current={selected === item.id ? "true" : undefined} onClick={() => select(item.id)}>{item.label}</button>
      </div>)}
    </aside>
    <section className="admin-form visuals-fields" aria-labelledby="visuals-title">
      <h2 id="visuals-title">{slot.page} → {slot.label}</h2>
      <p className="field-hint">The frame is transparent. Choose a pattern, media, or both. With no media, the pattern fills the space.</p>
      {selected === "home.hero" ? <label className="admin-field"><span>Hero frame size</span><select value={config.frameShape ?? "slot"} onChange={event => update({ frameShape: event.target.value as NonNullable<SectionVisualConfig["frameShape"]> })}><option value="slot">Current hero frame</option><option value="square">Square frame</option><option value="source" disabled={!asset}>Fit to media proportions (no crop)</option></select><small className="field-hint">The media’s original proportions fit inside the hero column; portrait media stays narrow and landscape media stays wide.</small></label> : null}
      <div className="visuals-mode" role="group" aria-label="Display mode">
        {(["pattern", "media", "both"] as const).map(mode => <button key={mode} type="button" aria-pressed={config.mode === mode} disabled={mode !== "pattern" && !asset} onClick={() => update({ mode })}>{mode === "both" ? "Pattern + media" : mode === "media" ? "Media only" : "Pattern only"}</button>)}
      </div>
      <div className="form-columns">
        <label className="admin-field"><span>Pattern design (20 choices)</span><select value={config.pattern} onChange={event => update({ pattern: event.target.value as SectionVisualConfig["pattern"] })}>{VISUAL_PATTERN_IDS.map(pattern => <option key={pattern} value={pattern === "flow" && config.pattern === "default" ? "default" : pattern}>{VISUAL_PATTERN_DETAILS[pattern].label}</option>)}</select><small className="field-hint">{config.pattern === "default" ? "Ideas and actions working together." : VISUAL_PATTERN_DETAILS[config.pattern].description}</small></label>
        <label className="admin-field"><span>Pattern intensity: {config.intensity}%</span><input type="range" min="0" max="100" value={config.intensity} onChange={event => update({ intensity: Number(event.target.value) })} /></label>
      </div>
      <div className="visuals-media-actions">
        <button className="admin-button" type="button" onClick={() => setChooser(true)}>{asset ? "Change media" : "Choose image, GIF or MP4"}</button>
        {asset ? <button className="admin-action" type="button" onClick={() => update({ assetId: undefined, mode: "pattern", alt: "" })}>Remove media</button> : null}
      </div>
      {asset ? <>
        <p className="field-hint">Selected: {asset.format.toUpperCase()} · {asset.width} × {asset.height} px. Videos play muted and loop without controls.</p>
        <label className="admin-field"><span>Accessible description</span><input id="visual-alt" value={config.alt} maxLength={300} onChange={event => update({ alt: event.target.value })} placeholder="Describe the visual" /></label>
        <div className="form-columns">
          <label className="admin-field"><span>Fit inside frame</span><select value={config.fit} onChange={event => update({ fit: event.target.value as "contain" | "cover" })}><option value="contain">Fit whole media (transparent artwork)</option><option value="cover">Fill and crop (photos or video)</option></select></label>
          <label className="admin-field"><span>Horizontal position: {config.focalX}%</span><input type="range" min="0" max="100" value={config.focalX} onChange={event => update({ focalX: Number(event.target.value) })} /></label>
          <label className="admin-field"><span>Vertical position: {config.focalY}%</span><input type="range" min="0" max="100" value={config.focalY} onChange={event => update({ focalY: Number(event.target.value) })} /></label>
        </div>
      </> : null}
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
      <div className="homepage-device-switch"><button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>Desktop preview</button><button type="button" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}>Mobile preview</button></div>
      <div className={`visuals-preview ${device}`} style={{ aspectRatio: selected === "home.hero" && config.frameShape === "square" ? "1 / 1" : selected === "home.hero" && config.frameShape === "source" && asset ? `${asset.width} / ${asset.height}` : slot.ratio }}><SectionVisual data={{ config, asset }} label={slot.label} /></div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      <button className="admin-button" type="button" disabled={busy || !dirty} onClick={() => void save()}>{busy ? "Saving…" : "Save visual"}</button>
    </section>
    {chooser ? <ImageChooser sources={imageSourcesFor("editor", { allowUrl: false })} allowVideo onClose={() => setChooser(false)} onChoose={choice => {
      setChooser(false);
      if (choice.kind !== "library") return;
      setLibrary(current => [choice.asset, ...current.filter(item => item._id !== choice.asset._id)]);
      update({ assetId: choice.asset._id, alt: choice.asset.altText, mode: "both", fit: choice.asset.kind === "video" ? "cover" : "contain", focalX: 50, focalY: 50 });
    }} /> : null}
  </div>;
}
