"use client";

import { useRef, useState, type PointerEvent } from "react";
import { SectionVisual } from "@/components/section-visual";
import { DEFAULT_CROP, mediaGeometry, recommendedFrame, resolveCrop, resolveFrame, type FrameSize, type VisualCrop } from "@/lib/visual-layout";
import type { MediaAsset, SectionVisualConfig } from "@/lib/repo/types";

function DimensionInput({ label, value, onChange }: { label: string; value: number; onChange: (next: number) => void }) {
  const [input, setInput] = useState({ value, text: String(value) });
  if (input.value !== value) setInput({ value, text: String(value) });
  const draft = input.text;
  const setDraft = (text: string) => setInput({ value, text });
  return <label className="admin-field"><span>{label}</span><input type="number" min={40} max={2400} step={1} value={draft} onChange={event => {
    setDraft(event.target.value);
    const next = Number(event.target.value);
    if (next >= 40 && next <= 2400) onChange(next);
  }} onBlur={() => { const next = Math.round(Math.max(40, Math.min(2400, Number(draft) || value))); setDraft(String(next)); onChange(next); }} /></label>;
}

export function VisualFrameEditor({ config, asset, slotId, label, update }: {
  config: SectionVisualConfig; asset?: MediaAsset; slotId: string; label: string; update: (patch: Partial<SectionVisualConfig>) => void;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [locked, setLocked] = useState(true);
  const drag = useRef<{ pointer: number; startX: number; startY: number; x: number; y: number; width: number; height: number } | null>(null);
  const frame = resolveFrame(config, slotId, asset);
  const size = device === "mobile" ? frame.mobile ?? frame : frame;
  const crop = resolveCrop(config, size, asset);
  const geometry = mediaGeometry(size, asset ?? size, config.fit, crop);
  const recommendation = recommendedFrame(slotId);
  const hasMedia = !!asset && config.mode !== "pattern";
  const previewConfig = config.frame ? config : { ...config, frame, crop };

  function changeFrame(next: FrameSize) {
    update({ frameShape: "slot", frame: device === "mobile" ? { ...frame, mobile: next } : { ...frame, ...next }, crop });
  }
  function changeDimension(key: "width" | "height", value: number) {
    const other = key === "width" ? "height" : "width";
    const next = { width: size.width, height: size.height, [key]: value };
    if (locked) next[other] = Math.round(Math.max(40, Math.min(2400, value * size[other] / size[key])));
    changeFrame(next);
  }
  function changeCrop(patch: Partial<VisualCrop>, fit = config.fit) {
    const next = { ...crop, ...patch };
    if (!next.free && fit === "cover") next.zoom = Math.max(1, next.zoom);
    const adjusted = mediaGeometry(size, asset ?? size, fit, next);
    update({ frame, frameShape: "slot", fit, crop: { ...next, x: adjusted.x, y: adjusted.y } });
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!hasMedia || event.button !== 0) return;
    const visual = event.currentTarget.querySelector(".section-visual")!;
    const rect = visual.getBoundingClientRect();
    if (!rect.width || !rect.height || (event.target as HTMLElement).closest(".visual-callout")) return;
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
    drag.current = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY, x: geometry.x, y: geometry.y, width: rect.width, height: rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || start.pointer !== event.pointerId) return;
    const bound = (value: number) => Math.max(-200, Math.min(200, value));
    changeCrop({ x: bound(start.x + (event.clientX - start.startX) / start.width * 100), y: bound(start.y + (event.clientY - start.startY) / start.height * 100) });
  }
  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointer !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <fieldset className="visual-frame-editor"><legend>Frame &amp; crop</legend>
    <div className="homepage-device-switch"><button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>Desktop preview</button><button type="button" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}>Mobile preview</button></div>
    <p className="field-hint">Recommended: {recommendation.width} × {recommendation.height} px. Frames shrink proportionally to fit the section.</p>
    <div className="visuals-media-actions">
      <button type="button" className="admin-action" onClick={() => { update({ frame: { ...recommendation }, frameShape: "slot", crop }); }}>Apply recommended</button>
      <button type="button" className="admin-action" onClick={() => { update({ frame: { ...recommendation }, frameShape: "slot", crop }); setLocked(true); }}>Reset frame</button>
    </div>
    {device === "mobile" ? <label className="visual-check"><input type="checkbox" checked={!!frame.mobile} onChange={event => update({ frame: { ...frame, mobile: event.target.checked ? { width: frame.width, height: frame.height } : undefined }, frameShape: "slot", crop })} />Use separate mobile dimensions</label> : null}
    <div className="visual-frame-workspace">
      <div className="visual-frame-controls">
        {device === "desktop" || frame.mobile ? <>
          <div className="form-columns"><DimensionInput label="Frame width (px)" value={size.width} onChange={value => changeDimension("width", value)} /><DimensionInput label="Frame height (px)" value={size.height} onChange={value => changeDimension("height", value)} /></div>
          <label className="visual-check"><input type="checkbox" checked={locked} onChange={event => setLocked(event.target.checked)} />Lock frame ratio</label>
          <label className="admin-field"><span>Frame proportions</span><select aria-label="Frame proportions" value="custom" onChange={event => {
            if (event.target.value === "custom") return;
            const [width, height] = event.target.value.split(":").map(Number);
            changeFrame({ width: size.width, height: Math.max(40, Math.min(2400, Math.round(size.width * height / width))) });
          }}><option value="custom">Custom ({size.width} × {size.height})</option><option value="1:1">Square · 1:1</option><option value="4:5">Portrait · 4:5</option><option value="4:3">Landscape · 4:3</option><option value="16:9">Wide · 16:9</option></select></label>
          {asset?.width && asset.height ? <button type="button" className="admin-action" onClick={() => changeFrame({ width: size.width, height: Math.max(40, Math.min(2400, Math.round(size.width * asset.height / asset.width))) })}>Match media ratio</button> : null}
        </> : <p className="field-hint">Mobile uses the desktop proportions and shrinks to the available space. Enable separate dimensions to change its shape or size.</p>}
        <label className="admin-field"><span>Frame corners: {frame.radius}px</span><input type="range" min={0} max={200} value={frame.radius} onChange={event => update({ frame: { ...frame, radius: Number(event.target.value) }, frameShape: "slot", crop })} /></label>
        {hasMedia ? <>
          <label className="admin-field"><span>Media fit</span><select aria-label="Media fit" value={config.fit} onChange={event => changeCrop({ ...DEFAULT_CROP, free: crop.free }, event.target.value as "cover" | "contain")}><option value="cover">Fill / Crop</option><option value="contain">Fit whole media</option></select></label>
          <label className="admin-field"><span>Zoom: {Math.round(crop.zoom * 100)}%</span><input aria-label="Zoom" type="range" min={!crop.free && config.fit === "cover" ? 100 : 10} max={500} step={1} value={crop.zoom * 100} onChange={event => changeCrop({ zoom: Number(event.target.value) / 100 })} /></label>
          <label className="visual-check"><input type="checkbox" checked={crop.free} onChange={event => changeCrop({ free: event.target.checked })} />Free positioning (allow empty space)</label>
          <label className="admin-field"><span>Horizontal position: {Math.round(geometry.x)}%</span><input aria-label="Horizontal position" type="range" min={crop.free ? -200 : -Math.min(200, geometry.limitX)} max={crop.free ? 200 : Math.min(200, geometry.limitX)} step={.1} value={geometry.x} disabled={!crop.free && geometry.limitX < .01} onChange={event => changeCrop({ x: Number(event.target.value) })} /></label>
          <label className="admin-field"><span>Vertical position: {Math.round(geometry.y)}%</span><input aria-label="Vertical position" type="range" min={crop.free ? -200 : -Math.min(200, geometry.limitY)} max={crop.free ? 200 : Math.min(200, geometry.limitY)} step={.1} value={geometry.y} disabled={!crop.free && geometry.limitY < .01} onChange={event => changeCrop({ y: Number(event.target.value) })} /></label>
          <div className="visuals-media-actions"><button type="button" className="admin-action" onClick={() => changeCrop({ x: 0, y: 0 })}>Center media</button><button type="button" className="admin-action" onClick={() => changeCrop({ ...DEFAULT_CROP }, "cover")}>Reset crop</button></div>
        </> : null}
      </div>
      <div className="visual-preview-column">
        <div className={`visuals-preview ${device}${hasMedia ? " is-draggable" : ""}`} style={{ "--preview-ratio": size.width / size.height } as React.CSSProperties} aria-label={`${device === "mobile" ? "Mobile" : "Desktop"} frame preview`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={() => { drag.current = null; }}>
          <SectionVisual data={{ config: previewConfig, asset }} label={label} previewDevice={device} />
        </div>
        <p className="field-hint">{hasMedia ? "Drag the media to adjust its crop. Zoom and position apply to both desktop and mobile. Anything outside the frame is hidden." : "Choose media to enable crop controls."}</p>
        {!config.frame ? <p className="field-hint">Existing visual: this is the editable frame preview. Apply a frame setting to use these dimensions on the website.</p> : null}
      </div>
    </div>
  </fieldset>;
}
