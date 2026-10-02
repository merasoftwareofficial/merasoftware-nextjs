import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import { mediaRepo, settingsRepo } from "@/lib/repo";
import { VisualsEditor } from "./visuals-editor";

export default async function VisualsPage({ searchParams }: { searchParams: Promise<{ slot?: string }> }) {
  await requireStaffPage("/admin/visuals", "editor");
  const [{ slot }, settings, assets] = await Promise.all([searchParams, settingsRepo.get(), mediaRepo.list()]);
  const legacy = settings.homepageImages?.hero;
  const initial = { ...settings.sectionVisuals };
  if (!initial["home.hero"] && legacy) initial["home.hero"] = {
    mode: "both", pattern: "orbit", intensity: 65, fit: "cover", assetId: legacy.assetId,
    focalX: legacy.focalX, focalY: legacy.focalY, alt: legacy.alt,
  };
  return <main className="admin-main">
    <AdminHeader eyebrow="SITE CONTENT" title="Section visuals" description="Set a meaningful pattern, image, animated GIF or silent looping video for every website section." />
    <VisualsEditor initial={initial} assets={assets} focusSlot={slot} />
  </main>;
}
