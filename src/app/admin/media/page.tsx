import { AdminHeader } from "@/components/admin-layout";
import { atLeast, requireStaffPage } from "@/lib/auth";
import { findMediaUsage } from "@/lib/media-usage";
import { MediaUploader } from "./media-uploader";
import { mediaRepo } from "@/lib/repo";

export default async function Media() {
  const user = await requireStaffPage("/admin/media", "editor");
  const assets = await mediaRepo.list();
  const usage = await findMediaUsage(assets);
  const items = assets.map(asset => ({ asset, uses: usage.get(asset._id) ?? [] }));

  return (
    <main className="admin-main">
      <AdminHeader
        eyebrow="CLOUDINARY MEDIA"
        title="Media library"
        description="Upload images to Cloudinary and manage them. An image in use shows where it is used and cannot be deleted until it is removed from there."
      />
      <MediaUploader items={items} canDelete={atLeast(user.role, "admin")} />
    </main>
  );
}
