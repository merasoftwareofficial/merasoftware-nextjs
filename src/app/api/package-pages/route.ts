import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { settingsRepo } from "@/lib/repo";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { requireSalesAdmin, salesBackend } from "@/lib/sales-catalogue-server";
import { isPackagePageSlug, newPackagePageSchema, packagePageSlug, resolvedPackagePages } from "@/lib/package-pages";

const list = async () => resolvedPackagePages((await settingsRepo.get()).packagePages);

// Creates a "Pricing & Packages" page from the package editor. The slug comes from the title
// and is permanent.
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requireSalesAdmin();
    const { title, intro } = newPackagePageSchema.parse(await request.json());
    const slug = packagePageSlug(title);
    if (!isPackagePageSlug(slug)) return NextResponse.json({ error: "Use letters or numbers in the page name." }, { status: 400 });
    const pages = await list();
    const order = pages.reduce((max, page) => Math.max(max, page.order + 1), 0);
    if (!await settingsRepo.savePackagePage({ slug, title, intro, order })) return NextResponse.json({ error: "A page with this name already exists." }, { status: 409 });
    return NextResponse.json(await list());
  } catch (error) { return errorResponse(error); }
}

// Deletes a page. The portal first removes it from every package (the packages stay), so no
// package keeps a page that no longer exists; then the page leaves the menu and its URL 404s.
export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    await requireSalesAdmin();
    const slug = new URL(request.url).searchParams.get("slug") ?? "";
    if (!isPackagePageSlug(slug) || !(await list()).some(page => page.slug === slug)) return NextResponse.json({ error: "Page not found." }, { status: 404 });
    await salesBackend(true, { pageSlug: slug }, "sales-packages/page-unlink");
    await settingsRepo.deletePackagePage(slug);
    return NextResponse.json(await list());
  } catch (error) { return errorResponse(error); }
}
