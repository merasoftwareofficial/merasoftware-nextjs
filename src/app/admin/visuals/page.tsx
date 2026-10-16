import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import { mediaRepo, settingsRepo } from "@/lib/repo";
import { VisualsEditor } from "./visuals-editor";
import { VISUAL_SLOTS, defaultVisual, slotInfo, type VisualSlotId } from "@/lib/visual-slots";

import { resolveAbout, resolveServices, sectionVisualOptions } from "@/lib/page-content";

export default async function VisualsPage({ searchParams }: { searchParams: Promise<{ slot?: string }> }) {
  await requireStaffPage("/admin/visuals", "editor");
  const [{ slot }, settings, assets] = await Promise.all([searchParams, settingsRepo.get(), mediaRepo.list()]);
  const legacy = settings.homepageImages?.hero;
  const initial = { ...settings.sectionVisuals };
  if (!initial["home.hero"] && legacy) initial["home.hero"] = {
    mode: "both", pattern: "orbit", intensity: 65, fit: "cover", assetId: legacy.assetId,
    focalX: legacy.focalX, focalY: legacy.focalY, alt: legacy.alt,
  };
  for (const [id, config] of Object.entries(initial)) {
    if (!slotInfo(id)) continue;
    const defaults = defaultVisual(id as VisualSlotId);
    initial[id] = { ...defaults, ...config, card: { ...defaults.card!, ...config.card } };
  }
  const contentSlots = [...Object.entries(resolveAbout(settings)).flatMap(([section, content]) => sectionVisualOptions("about", section, content)), ...Object.entries(resolveServices(settings)).flatMap(([section, content]) => sectionVisualOptions("services", section, content))];
  const slots = [...new Map([...VISUAL_SLOTS, ...Object.keys(initial).flatMap(id => slotInfo(id) ? [slotInfo(id)!] : []), ...contentSlots].map(slot => [slot.id, slot])).values()];
  const pageOrder = [...new Set(VISUAL_SLOTS.map(slot => slot.page))];
  slots.sort((left, right) => pageOrder.indexOf(left.page as typeof pageOrder[number]) - pageOrder.indexOf(right.page as typeof pageOrder[number]));
  return <main className="admin-main">
    <AdminHeader eyebrow="SITE CONTENT" title="Section visuals" description="Set a meaningful pattern, image, animated GIF or silent looping video for every website section." />
    <VisualsEditor initial={initial} assets={assets} focusSlot={slot} slots={slots} />
  </main>;
}
