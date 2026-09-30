import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import { MediaUploader } from "./media-uploader";
import { mediaRepo } from "@/lib/repo";

export default async function Media() {
  await requireStaffPage("/admin/media", "editor");
  const assets = await mediaRepo.list();

  return (
    <main className="admin-main">
      <AdminHeader
        eyebrow="CLOUDINARY MEDIA"
        title="Media library"
        description="Upload a photo to Cloudinary and check its URL. Uploads go into the merasoftware folder."
      />
      <MediaUploader initialAssets={assets} />
    </main>
  );
}
