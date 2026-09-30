import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { atLeast, requireStaffPage } from "@/lib/auth";
import { settingsRepo } from "@/lib/repo";
import { CommentSettings } from "./comment-settings";
import { ViewSettings } from "./view-settings";
import { ShareSettings } from "./share-settings";
import { SHARE_BUTTONS } from "@/lib/share-rules";

export const metadata = { title: "Site settings" };

export default async function Settings() {
  const user = await requireStaffPage("/admin/settings");

  if (!atLeast(user.role, "admin")) {
    return (
      <main className="admin-main">
        <AdminHeader eyebrow="SITE SETTINGS" title="Site settings" description="Only an admin can change these." />
        <div className="admin-empty">
          <b>Not allowed.</b>
          <br />
          Your account is a {user.role}.{" "}
          <Link className="admin-action" href="/admin">
            Back to overview →
          </Link>
        </div>
      </main>
    );
  }

  const settings = await settingsRepo.get();

  return (
    <main className="admin-main">
      <AdminHeader
        eyebrow="SITE SETTINGS"
        title="Site settings"
        description="Comments, view counts and share buttons across the blog."
      />

      {/*
        The business-details form (name, email, WhatsApp, default SEO
        description, social profiles) was a placeholder that saved nothing, so
        it is gone until it is built for real with a store behind it.
      */}
      <CommentSettings settings={settings} />
      <ViewSettings settings={settings} />
      <ShareSettings settings={settings} options={SHARE_BUTTONS} />
    </main>
  );
}
