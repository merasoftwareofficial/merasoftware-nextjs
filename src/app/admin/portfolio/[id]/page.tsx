import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth";
import { portfolioRepo } from "@/lib/portfolio/repo";
import { PortfolioEditor } from "./portfolio-editor";
export default async function Edit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; await requireStaffPage(`/admin/portfolio/${id}`, "editor");
  const [entry, entries] = await Promise.all([portfolioRepo.find(id), portfolioRepo.list()]); if (!entry) notFound();
  const linkedServices = entries.filter(row => row.source.available && row.source.linkedProjectId === id).map(row => row.source.name);
  return <main className="admin-main"><PortfolioEditor entry={entry} linkedServices={linkedServices} /></main>;
}
