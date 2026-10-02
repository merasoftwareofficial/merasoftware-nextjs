import { SectionVisual } from "@/components/section-visual";
import type { VisualSlotData } from "@/lib/section-visuals";

export function PageHero({ eyebrow, title, text, visual }: { eyebrow: string; title: string; text: string; visual?: VisualSlotData }) {
  if (!visual) return <section className="page-hero"><div className="container"><p className="eyebrow"><i /> {eyebrow}</p><h1>{title}</h1><p>{text}</p></div></section>;
  return <section className="page-hero"><div className="container visual-page-hero"><div><p className="eyebrow"><i /> {eyebrow}</p><h1>{title}</h1><p>{text}</p></div><SectionVisual data={visual} label={`${eyebrow} illustration`} /></div></section>;
}
