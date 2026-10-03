import { requireStaffPage } from "@/lib/auth";
import { AdminHeader } from "@/components/admin-layout";
import { portfolioRepo } from "@/lib/portfolio/repo";
import { PortfolioList } from "./portfolio-list";
import { PortfolioSync } from "./portfolio-sync";
export default async function Portfolio() {
  await requireStaffPage("/admin/portfolio", "editor");
  const entries = await portfolioRepo.list();
  return <main className="admin-main"><AdminHeader eyebrow="SITE CONTENT" title="Portfolio" description="Projects and purchased services arrive as drafts. Review screenshots and publish the work you want to show." /><PortfolioSync /><PortfolioList entries={entries} /></main>;
}
