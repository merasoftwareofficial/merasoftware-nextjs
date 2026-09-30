import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import { mediaRepo, settingsRepo } from "@/lib/repo";
import { HomepageImageEditor } from "./homepage-image-editor";

export default async function Homepage() {
  await requireStaffPage("/admin/homepage", "editor");
  const [settings, assets] = await Promise.all([settingsRepo.get(), mediaRepo.list()]);

  return (
    <main className="admin-main">
      <AdminHeader eyebrow="SITE CONTENT" title="Homepage images" description="Add and position images in the existing homepage design." />
      <HomepageImageEditor initialImages={settings.homepageImages ?? {}} assets={assets} />
    </main>
  );
}
