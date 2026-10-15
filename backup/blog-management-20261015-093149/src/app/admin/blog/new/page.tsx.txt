import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import { categoryChoices } from "@/lib/category-rules";
import { tagSuggestions } from "@/lib/tag-options";
import { categoryRepo, mediaRepo, settingsRepo } from "@/lib/repo";
import { BlogForm } from "../blog-form";

export const metadata = { title: "New article" };

export default async function NewBlog() {
  const user = await requireStaffPage("/admin/blog/new");
  const [settings, categories, assets, tags] = await Promise.all([settingsRepo.get(), categoryRepo.list(), mediaRepo.list(), tagSuggestions()]);

  return (
    <main className="admin-main">
      <AdminHeader
        eyebrow="BLOG POSTS"
        title="New article"
        description="Write the article, set its SEO details, then save it as a draft or publish it."
        action={
          <Link className="admin-button secondary" href="/admin/blog">
            Cancel
          </Link>
        }
      />
      <BlogForm
        role={user.role}
        commentDefaults={{ commentsEnabled: settings.commentsEnabled, commentDefault: settings.commentDefault }}
        categories={categoryChoices(categories, "official")}
        assets={assets}
        tagSuggestions={tags}
      />
    </main>
  );
}
