/* eslint @next/next/no-img-element: off -- Cloudinary and transparent artwork use their original URLs. */
import type { VisualSlotData } from "@/lib/section-visuals";

function Pattern({ variant, intensity }: { variant: string; intensity: number }) {
  const shared = { fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg className="section-visual-pattern" viewBox="0 0 400 300" aria-hidden="true" style={{ opacity: intensity / 100 }} {...shared}>
    {variant === "grid" ? <><rect x="62" y="36" width="276" height="222" rx="15" /><path d="M62 77h276M95 58h4m17 0h4m17 0h4M84 110h105v105H84zM211 110h104M211 136h104M211 162h65M211 189h104M211 215h82" /><circle cx="136" cy="162" r="25" /></> : null}
    {variant === "orbit" ? <><circle cx="201" cy="150" r="104" /><circle cx="201" cy="150" r="57" /><circle cx="201" cy="150" r="14" fill="currentColor" /><circle cx="288" cy="93" r="21" /><circle cx="109" cy="199" r="12" /><path d="M54 91h75M280 230h66M76 107h35M312 214h45" /></> : null}
    {variant === "growth" ? <><path d="M48 244h308M59 244v-49h53v49M135 244v-79h53v79M211 244v-108h53v108M287 244V89h53v155" /><path d="M61 148l73-20 70 9 60-55 74-38m-25 0h25v25" /><circle cx="134" cy="128" r="6" fill="currentColor" /><circle cx="264" cy="82" r="6" fill="currentColor" /></> : null}
    {variant === "dialogue" ? <><path d="M53 73q0-21 21-21h169q21 0 21 21v80q0 21-21 21h-95l-52 35v-35H74q-21 0-21-21z" /><path d="M159 117h169q19 0 19 19v79q0 20-19 20h-35v30l-43-30h-91q-19 0-19-20v-41M87 93h135M87 120h104M180 195h122M180 213h86" /></> : null}
    {variant === "reading" ? <><path d="M56 53q73-18 144 11 71-29 144-11v196q-71-18-144 11-71-29-144-11zM200 64v196M77 87q50-9 101 8M77 116q50-9 101 8M77 145q50-9 101 8M222 95q50-17 101-8M222 124q50-17 101-8M222 153q50-17 101-8M222 182q36-12 73-10" /></> : null}
    {variant === "mail" ? <><rect x="54" y="71" width="292" height="178" rx="16" /><path d="M54 89l146 108L346 89M54 235l108-83m184 83-108-83M97 44h206M130 28h140" /><circle cx="201" cy="153" r="17" fill="currentColor" /></> : null}
    {variant === "flow" || variant === "default" ? <><circle cx="87" cy="82" r="29" /><circle cx="200" cy="151" r="42" /><circle cx="314" cy="85" r="29" /><circle cx="314" cy="236" r="26" /><circle cx="88" cy="230" r="26" /><path d="M113 98l51 32m73-4 51-26m-52 54 55 63m-127-40-56 39M88 53v-25M314 56V30M88 256v24M314 262v22" /></> : null}
  </svg>;
}

export function SectionVisual({ data, className = "", label }: { data?: VisualSlotData; className?: string; label?: string }) {
  if (!data) return null;
  const { config, asset } = data;
  const showMedia = config.mode !== "pattern" && !!asset;
  const showPattern = config.mode !== "media" || !asset;
  const both = showMedia && showPattern;
  const position = `${config.focalX}% ${config.focalY}%`;
  return <div className={`section-visual ${both ? "section-visual-both" : ""} ${className}`} aria-label={label}>
    {showPattern ? <Pattern variant={config.pattern} intensity={config.intensity} /> : null}
    {showMedia && asset ? asset.kind === "video"
      ? <video className="section-visual-media" src={asset.url} muted autoPlay loop playsInline preload="metadata" aria-label={config.alt || label} style={{ objectFit: config.fit, objectPosition: position }} />
      : <img className="section-visual-media" src={asset.url} alt={config.alt} loading="lazy" style={{ objectFit: config.fit, objectPosition: position }} /> : null}
  </div>;
}
