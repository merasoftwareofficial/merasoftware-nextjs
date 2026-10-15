import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { AdminTable } from "@/components/admin-table";
import { requireStaffPage } from "@/lib/auth";
import { nameClash } from "@/lib/category-rules";
import { blogRepo, categoryRepo } from "@/lib/repo";
import { topicPath } from "@/lib/topic-slug";
import { AddCategory, CategoryActions, UnlistedActions } from "./category-actions";

export const metadata = { title: "Categories" };

/**
 * The blog's category list. Only an admin changes it (owner decision, 30 Sep
 * 2026); editors and members choose from it in the post forms.
 */
export default async function Categories() {
  await requireStaffPage("/admin/categories", "admin");
  const [categories, counts] = await Promise.all([categoryRepo.list(), blogRepo.categoryCounts()]);

  // Posts can only be moved into a category that is offered for new posts.
  const targets = categories.filter(category => !category.archived).map(category => ({ id: category._id, name: category.name }));
  const listed = new Set(categories.map(category => category.name));
  const unlisted = Object.entries(counts)
    .filter(([name]) => !listed.has(name))
    .sort(([a], [b]) => a.localeCompare(b));

  const rows = categories.map(category => {
    const count = counts[category.name] ?? 0;
    return [
      <Link key="name" className="text-link" href={topicPath(category.name)} target="_blank">
        {category.name}
      </Link>,
      count,
      category.membersCanUse ? "Yes" : "No",
      category.archived ? "Archived" : "Active",
      <CategoryActions
        key={category._id}
        id={category._id}
        name={category.name}
        count={count}
        membersCanUse={category.membersCanUse}
        archived={category.archived}
        targets={targets.filter(target => target.id !== category._id)}
      />,
    ];
  });

  const unlistedRows = unlisted.map(([name, count]) => [
    name,
    count,
    <UnlistedActions key={name} name={name} count={count} targets={targets} canAdd={!nameClash(categories, name)} />,
  ]);

  return (
    <main className="admin-main">
      <AdminHeader
        eyebrow="BLOG ORGANISATION"
        title="Categories"
        description="Every post is filed under one of these. Editors and members choose from this list; only admins change it."
      />

      <section className="admin-panel">
        <AddCategory />
      </section>

      {rows.length ? (
        <AdminTable headers={["Category", "Posts", "Members can use", "Status", "Actions"]} rows={rows} />
      ) : (
        <div className="admin-empty">No categories yet. Add the first one above.</div>
      )}

      {unlistedRows.length ? (
        <section className="admin-panel category-unlisted">
          <h2>Found only on posts</h2>
          <p>
            These names were typed on posts before this list existed. Add one to the list as it is, or move its posts into a
            listed category. Nothing here changes until you choose.
          </p>
          <AdminTable headers={["Name on posts", "Posts", "Actions"]} rows={unlistedRows} />
        </section>
      ) : null}
    </main>
  );
}
