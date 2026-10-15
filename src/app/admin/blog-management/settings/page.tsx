import { AdminHeader } from "@/components/admin-layout";
import { BlogManagementNav } from "@/components/blog-management-nav";
import { requireStaffPage } from "@/lib/auth";
import { settingsRepo } from "@/lib/repo";
import { SHARE_BUTTONS } from "@/lib/share-rules";
import { CommentSettings } from "@/app/admin/settings/comment-settings";
import { ViewSettings } from "@/app/admin/settings/view-settings";
import { ShareSettings } from "@/app/admin/settings/share-settings";

export const metadata = { title: "Blog settings" };
export default async function BlogSettings() {
  await requireStaffPage("/admin/blog-management/settings", "admin");
  const settings = await settingsRepo.get();
  return <main className="admin-main">
    <BlogManagementNav />
    <AdminHeader eyebrow="BLOG MANAGEMENT" title="Blog settings" description="Comment defaults, public view counts and sharing options." />
    <CommentSettings settings={settings} />
    <ViewSettings settings={settings} />
    <ShareSettings settings={settings} options={SHARE_BUTTONS} />
  </main>;
}
