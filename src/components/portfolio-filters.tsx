"use client";
import { useNavigate } from "@/components/loading/navigation";
import { SortMenu, type SortOption } from "@/components/campaign/sort-menu";
import c from "@/components/campaign/campaign.module.css";

const TYPE_OPTIONS: readonly SortOption<string>[] = [
  { value: "", label: "All work" },
  { value: "project", label: "Projects" },
  { value: "service", label: "Services" },
];

export type WorkCategoryChoice = { value: string; label: string; count: number };

export function PortfolioFilters({
  totalCount,
  categories,
  selectedCategory,
  selectedType,
}: {
  totalCount: number;
  categories: WorkCategoryChoice[];
  selectedCategory: string;
  selectedType: string;
}) {
  const router = useNavigate();

  const navigate = (nextCategory: string, nextType: string) => {
    const query = new URLSearchParams();
    if (nextCategory) query.set("category", nextCategory);
    if (nextType) query.set("type", nextType);
    const qs = query.toString();
    router.push(qs ? `/work?${qs}` : "/work");
  };

  return (
    <div className={c.pkgFilters}>
      {categories.length > 1 && (
        <div className={c.pkgFilterRow} role="group" aria-label="Filter by category">
          <span className={c.pkgFilterLabel}>Category</span>
          {[{ value: "", label: "All", count: totalCount }, ...categories].map(choice => (
            <button
              key={choice.value || "all"}
              type="button"
              className={c.pkgChip}
              aria-pressed={selectedCategory === choice.value}
              onClick={() => navigate(choice.value, selectedType)}
            >
              {choice.label} <span className={c.pkgCount}>{choice.count}</span>
            </button>
          ))}
        </div>
      )}
      <SortMenu
        label="Work type:"
        ariaLabel="Work type"
        options={TYPE_OPTIONS}
        value={selectedType}
        onChange={value => navigate(selectedCategory, value)}
      />
    </div>
  );
}
