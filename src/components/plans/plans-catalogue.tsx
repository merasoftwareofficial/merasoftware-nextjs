"use client";
import { useState } from "react";
import { PLANS_PAGE_INTRO, PLANS_PAGE_TITLE, type PublicPlan, type PublicPlanCatalogue } from "@/lib/public-plans";
import { SortMenu, type SortOption } from "@/components/campaign/sort-menu";
import { PlanCard } from "./plan-card";
import c from "@/components/campaign/campaign.module.css";

type PlanSort = "default" | "price_asc" | "price_desc";

const SORTS: readonly SortOption<PlanSort>[] = [
  { value: "default", label: "Default" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

/**
 * Unified Website Update Plans catalogue matching StaffPackages (/packages/[slug]):
 * compact centered hero, segmented category filter chips (when > 1 category), capsule SortMenu,
 * and one unified card grid so all plans appear together.
 */
export function PlansCatalogue({ catalogue }: { catalogue: PublicPlanCatalogue }) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sort, setSort] = useState<PlanSort>("default");

  const sortedCategories = [...catalogue.categories].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.label.localeCompare(b.label),
  );
  const categoryLabels = new Map(sortedCategories.map(cat => [cat.key, cat.label]));
  const uncategorized = catalogue.plans.filter(plan => !plan.categoryKey || !categoryLabels.has(plan.categoryKey));

  const categoryChoices = [
    ...sortedCategories
      .map(cat => ({
        value: cat.key,
        label: cat.label,
        count: catalogue.plans.filter(plan => plan.categoryKey === cat.key).length,
      }))
      .filter(choice => choice.count > 0),
    ...(uncategorized.length ? [{ value: "__other__", label: "More plans", count: uncategorized.length }] : []),
  ];

  const activeCategory =
    selectedCategory === "all" || categoryChoices.some(choice => choice.value === selectedCategory)
      ? selectedCategory
      : "all";

  const filtered = catalogue.plans.filter(plan => {
    if (activeCategory === "all") return true;
    if (activeCategory === "__other__") return !plan.categoryKey || !categoryLabels.has(plan.categoryKey);
    return plan.categoryKey === activeCategory;
  });

  const shown: PublicPlan[] =
    sort === "default"
      ? filtered
      : [...filtered].sort((a, b) => {
          const pa = a.priceRange && a.priceRange.from > 0 ? a.priceRange.from : null;
          const pb = b.priceRange && b.priceRange.from > 0 ? b.priceRange.from : null;
          if (pa === null || pb === null) return pa === pb ? 0 : pa === null ? 1 : -1;
          return (sort === "price_asc" ? 1 : -1) * (pa - pb);
        });

  const labelFor = (plan: PublicPlan) => (plan.categoryKey && categoryLabels.get(plan.categoryKey)) || "Service Plan";

  return (
    <div className={c.staff}>
      <header className={c.pkgHero}>
        <p className={c.kicker}>PRICING &amp; PACKAGES</p>
        <h1>{PLANS_PAGE_TITLE}</h1>
        <p>{PLANS_PAGE_INTRO}</p>
      </header>
      {!catalogue.plans.length && <p>No plans are available right now. Contact us for a quotation.</p>}
      {catalogue.plans.length > 0 && (categoryChoices.length > 1 || catalogue.plans.length > 1) && (
        <div className={c.pkgFilters}>
          {categoryChoices.length > 1 && (
            <div className={c.pkgFilterRow} role="group" aria-label="Filter by category">
              <span className={c.pkgFilterLabel}>Category</span>
              {[
                { value: "all", label: "All", count: catalogue.plans.length },
                ...categoryChoices,
              ].map(choice => (
                <button
                  key={choice.value}
                  type="button"
                  className={c.pkgChip}
                  aria-pressed={activeCategory === choice.value}
                  onClick={() => setSelectedCategory(choice.value)}
                >
                  {choice.label} <span className={c.pkgCount}>{choice.count}</span>
                </button>
              ))}
            </div>
          )}
          {catalogue.plans.length > 1 && <SortMenu options={SORTS} value={sort} onChange={setSort} />}
        </div>
      )}
      {catalogue.plans.length > 0 && !shown.length && (
        <div className={c.pkgFilterEmpty}>
          <p>No plans match this filter.</p>
          <button
            type="button"
            className={c.pkgChip}
            onClick={() => {
              setSelectedCategory("all");
              setSort("default");
            }}
          >
            Show all plans
          </button>
        </div>
      )}
      <div className={c.pkgGrid}>
        {shown.map(plan => (
          <PlanCard key={plan._id} plan={plan} categoryLabel={labelFor(plan)} />
        ))}
      </div>
    </div>
  );
}
