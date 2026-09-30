import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import { DEFAULT_HOMEPAGE_CONTENT } from "@/lib/homepage-content";
import { mediaRepo, settingsRepo } from "@/lib/repo";
import { HomepageImageEditor } from "./homepage-image-editor";

export default async function Homepage() {
  await requireStaffPage("/admin/homepage", "editor");
  const [settings, assets] = await Promise.all([settingsRepo.get(), mediaRepo.list()]);

  return (
    <main className="admin-main">
      <AdminHeader eyebrow="SITE CONTENT" title="Homepage" description="Edit the current homepage copy and manage its images without changing the page design." />
      <HomepageImageEditor initialContent={settings.homepageContent ?? DEFAULT_HOMEPAGE_CONTENT} initialImages={settings.homepageImages ?? {}} assets={assets} />
    </main>
  );
}
