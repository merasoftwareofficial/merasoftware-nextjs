import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import { mediaRepo, settingsRepo } from "@/lib/repo";
import { VisualsEditor } from "./visuals-editor";
import { activeVisualSlots, resolveVisualConfigs } from "@/lib/visual-config";
import { linkGroups } from "@/lib/link-options";

export default async function VisualsPage({ searchParams }: { searchParams: Promise<{ slot?: string }> }) {
  await requireStaffPage("/admin/visuals", "editor");
  const [{ slot }, settings, assets, links] = await Promise.all([searchParams, settingsRepo.get(), mediaRepo.list(), linkGroups()]);
  const slots = activeVisualSlots(settings);
  const initial = resolveVisualConfigs(settings, slots.map(slot => slot.id));
  return <main className="admin-main">
    <AdminHeader eyebrow="SITE CONTENT" title="Section visuals" description="Set a meaningful pattern, image, animated GIF or silent looping video for every website section." />
    <VisualsEditor initial={initial} assets={assets} focusSlot={slot} slots={slots} links={links} />
  </main>;
}
