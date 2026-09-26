import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-layout";
import { Field } from "@/components/admin-form";
import { atLeast, getSessionUser } from "@/lib/auth";
import { settingsRepo } from "@/lib/repo";
import { CommentSettings } from "./comment-settings";

export const metadata = { title: "Site settings" };

export default async function Settings() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/settings");

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
        title="Business details"
        description="Global details used across the website, SEO and contact points."
      />

      {/* Wired to storage. Everything below it is still a placeholder form. */}
      <CommentSettings settings={settings} />

      <form className="admin-form">
        <div className="form-columns">
          <Field label="Business name" placeholder="Mera Software" />
          <Field label="Contact email" placeholder="contact@merasoftware.com" />
        </div>
        <div className="form-columns">
          <Field label="Website URL" placeholder="https://merasoftware.com" />
          <Field label="WhatsApp number" placeholder="Add when ready" />
        </div>
        <Field label="Default SEO description" placeholder="Web development, SEO and performance marketing..." large />
        <section className="admin-seo">
          <h2>Social profiles</h2>
          <div className="form-columns">
            <Field label="LinkedIn URL" placeholder="https://linkedin.com/..." />
            <Field label="Instagram URL" placeholder="https://instagram.com/..." />
          </div>
        </section>
        <button className="admin-button" type="button">
          Save settings
        </button>
      </form>
    </main>
  );
}
