/* eslint @next/next/no-img-element: off -- Cloudinary and transparent artwork use their original URLs. */
import { cloudinaryVideoPoster } from "@/lib/cloudinary-url";
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
    {variant === "strategy" ? <><circle cx="200" cy="150" r="108" /><circle cx="200" cy="150" r="73" /><path d="M200 28v30m0 184v30M78 150H48m304 0h-30M200 42l12 28-12-7-12 7zM200 258l12-28-12 7-12-7zM92 150l28-12-7 12 7 12zM308 150l-28-12 7 12-7 12z" /><path d="M238 112l-26 50-50 26 26-50z" /><circle cx="200" cy="150" r="9" fill="currentColor" /></> : null}
    {variant === "roadmap" ? <><path d="M58 234C120 234 102 90 188 90s70 116 150 38" strokeDasharray="9 10" /><circle cx="65" cy="231" r="19" /><circle cx="188" cy="90" r="22" /><circle cx="324" cy="141" r="22" /><path d="M65 223v16m-8-8h16M178 90l7 7 14-17M324 119V55m0 0 42 13-42 13M56 273h60m93-183h53m62 72v67" /></> : null}
    {variant === "collaboration" ? <><circle cx="92" cy="102" r="25" /><circle cx="200" cy="62" r="25" /><circle cx="308" cy="102" r="25" /><path d="M53 188v-17q0-32 39-32t39 32v17M161 130v-16q0-32 39-32t39 32v16M269 188v-17q0-32 39-32t39 32v17" /><rect x="117" y="158" width="166" height="92" rx="10" /><path d="M137 184h51m-51 23h88m-88 22h115M92 188l25 16m191-16-25 16M200 130v28" /></> : null}
    {variant === "pillars" ? <><path d="M52 258h296M75 81h250l-125-47zM80 81v19h240V81M69 238h262v20H69z" /><rect x="91" y="103" width="55" height="135" rx="4" /><rect x="173" y="103" width="55" height="135" rx="4" /><rect x="255" y="103" width="55" height="135" rx="4" /><path d="M102 125h33m49 0h33m49 0h33M102 214h33m49 0h33m49 0h33" /></> : null}
    {variant === "responsive" ? <><rect x="48" y="52" width="248" height="164" rx="11" /><path d="M48 87h248M75 69h5m17 0h5m17 0h5M73 112h97v75H73zM190 113h65m-65 24h65m-65 24h52M95 246h154m-78-30v30" /><rect x="264" y="115" width="86" height="145" rx="13" /><path d="M264 139h86m-86 99h86m40-111h26m-14 122h4M280 158h55m-55 18h55m-55 18h38" /></> : null}
    {variant === "search" ? <><rect x="54" y="45" width="292" height="212" rx="14" /><path d="M54 84h292M78 65h4m18 0h4m18 0h4M79 108h157m-157 23h195M79 177h130m-130 25h110m-110 25h145" /><rect x="72" y="147" width="192" height="93" rx="8" /><circle cx="290" cy="179" r="34" /><path d="M314 203l32 33M98 169h82m-82 23h59m-59 23h83" /></> : null}
    {variant === "audit" ? <><rect x="64" y="42" width="272" height="216" rx="11" /><path d="M64 81h272M88 62h4m18 0h4m18 0h4M94 122l10 10 18-21m-28 52 10 10 18-21m-28 52 10 10 18-21M142 121h97m-97 42h80m-80 42h73" /><circle cx="273" cy="191" r="34" /><path d="M297 215l39 39M260 191h26m-13-13v26" /></> : null}
    {variant === "campaign" ? <><path d="M65 135h83l117-62v154l-117-62H65zM91 165l22 79h49l-25-79M265 102l26 12v73l-26 12M322 80l26-22m-24 92h31m-33 65 26 22" /><circle cx="85" cy="150" r="11" /><path d="M178 119v63m24-75v87" /></> : null}
    {variant === "conversion" ? <><path d="M48 57h304l-91 79v64l-61 39-61-39v-64zM98 96h204M142 136h116M165 177h70" /><circle cx="200" cy="233" r="34" /><path d="M184 232l11 11 22-24M54 256h63m166 0h63" /></> : null}
    {variant === "analytics" ? <><rect x="54" y="43" width="292" height="214" rx="12" /><path d="M54 82h292M78 62h5m17 0h5M77 226h240M95 226v-45h35v45m22 0v-77h35v77m22 0v-58h35v58m22 0v-101h35v101" /><path d="M90 146l70-38 57 14 68-43 30 13m-13-16 13 16-20 9" /><circle cx="160" cy="108" r="5" fill="currentColor" /><circle cx="285" cy="79" r="5" fill="currentColor" /></> : null}
    {variant === "checklist" ? <><rect x="85" y="49" width="230" height="214" rx="12" /><path d="M156 49v-14h88v14M111 105l10 10 18-20m-28 69 10 10 18-20m-28 69 10 10 18-20M160 105h117m-117 21h81m-81 38h117m-117 21h81m-81 38h117m-117 21h81" /></> : null}
    {variant === "network" ? <><path d="M200 145L86 80m114 65 117-70m-117 70L75 224m125-79 118 82M86 80l231-5M75 224l243 3" /><circle cx="200" cy="145" r="43" /><circle cx="86" cy="80" r="25" /><circle cx="317" cy="75" r="25" /><circle cx="75" cy="224" r="25" /><circle cx="318" cy="227" r="25" /><circle cx="200" cy="145" r="12" fill="currentColor" /></> : null}
    {variant === "spotlight" ? <><path d="M97 65l103 161L303 65zM91 65h218M73 255h254M95 235h210" /><circle cx="200" cy="163" r="45" /><path d="M200 122l11 26 28 2-21 19 7 27-25-14-25 14 7-27-21-19 28-2zM61 54l-18-20m314 20 18-20M200 55V24" /></> : null}
  </svg>;
}

export function SectionVisual({ data, className = "", label }: { data?: VisualSlotData; className?: string; label?: string }) {
  if (!data) return null;
  const { config, asset } = data;
  const showMedia = config.mode !== "pattern" && !!asset;
  const showPattern = config.mode !== "media" || !asset;
  const both = showMedia && showPattern;
  const position = `${config.focalX}% ${config.focalY}%`;
  const sourceFrame = showMedia && config.frameShape === "source" && asset?.kind === "video" && asset.width > 0 && asset.height > 0;
  const frameRatio = config.frameShape === "square" ? "1 / 1" : sourceFrame ? `${asset.width} / ${asset.height}` : undefined;
  const frameStyle = frameRatio ? { aspectRatio: frameRatio } : undefined;
  const card = config.card;
  const callout = card?.enabled && (card.eyebrow || card.title || card.body || card.indexText) ? <aside className={`visual-callout ${card.placement === "overlay" ? "is-overlay" : "is-below"}`} style={{ "--callout-bg": card.background, "--callout-fg": card.foreground, "--callout-accent": card.accent } as React.CSSProperties}>
    {card.eyebrow ? <span className="visual-callout-eyebrow">{card.eyebrow}</span> : null}
    {card.indexText ? <strong className="visual-callout-index">{card.indexText}</strong> : null}
    {card.title ? <h3>{card.title}</h3> : null}
    {card.body ? <p>{card.body}</p> : null}
  </aside> : null;
  return <div className={`section-visual-stack ${className}`}>
    <div className={`section-visual ${both ? "section-visual-both" : ""} ${sourceFrame ? "section-visual-source" : ""}`} aria-label={label} style={frameStyle}>
    {showPattern ? <Pattern variant={config.pattern} intensity={config.intensity} /> : null}
    {showMedia && asset ? asset.kind === "video"
      ? <video className="section-visual-media" src={asset.url} poster={cloudinaryVideoPoster(asset.url, 900)} muted autoPlay loop playsInline preload="metadata" aria-label={config.alt || label} style={{ objectFit: sourceFrame ? "contain" : config.fit, objectPosition: position, ...(sourceFrame ? { aspectRatio: `${asset.width} / ${asset.height}` } : {}) }} />
      : <img className="section-visual-media" src={asset.url} alt={config.alt} loading="lazy" style={{ objectFit: config.fit, objectPosition: position }} /> : null}
    {card?.placement === "overlay" ? callout : null}
    </div>
    {card?.placement === "below" ? callout : null}
  </div>;
}
