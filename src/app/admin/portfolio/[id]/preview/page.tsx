import { notFound } from "next/navigation";
import Link from "@/components/link";
import { PortfolioStory } from "@/components/portfolio";
import { requireStaffPage } from "@/lib/auth";
import { portfolioRepo } from "@/lib/portfolio/repo";
import { publicPortfolio } from "@/lib/portfolio/types";
export const metadata = { title: "Portfolio preview", robots: { index: false, follow: false } };
export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; await requireStaffPage(`/admin/portfolio/${id}/preview`, "editor");
  const row = await portfolioRepo.find(id); if (!row) notFound();
  return <main className="admin-main"><p>Preview · {row.status} · <Link href={`/admin/portfolio/${id}`}>Back to editor</Link></p><PortfolioStory entry={publicPortfolio(row)} preview /></main>;
}
