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
      <div className="homepage-device-switch"><button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>Desktop preview</button><button type="button" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}>Mobile preview</button></div>
      <div className={`visuals-preview ${device}`} style={{ aspectRatio: slot.ratio }}><SectionVisual data={{ config, asset }} label={slot.label} /></div>
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
