/**
 * One plan on the public plans page (/plans): what it is, where its price starts and one line of
 * what it gives. Choosing and pricing happen on the plan's own page (components/plans/plan-builder.tsx),
 * as in the portal (frontend/src/components/CustomerPlanCards.js → pages/ServicePlanDetail.js).
 */

import Link from "@/components/link";
import { planBenefit, planPagePath, plainText, rangeLabel, type PublicPlan } from "@/lib/public-plans";
import s from "./plans.module.css";

export function PlanCard({ plan, categoryLabel }: { plan: PublicPlan; categoryLabel: string }) {
  const description = plainText(plan.description || "");
  const benefit = planBenefit(plan);
  return (
    <article className={s.card}>
      <p className={s.fine}>{categoryLabel}</p>
      <h3>{plan.serviceName}</h3>
      {description && <p className={s.description}>{description}</p>}
      <div className={s.range}>{rangeLabel(plan.priceRange) || "See the price for your choice"}</div>
      {benefit && <p className={s.benefit}>{benefit}</p>}
      <Link className={s.button} href={planPagePath(plan)}>{plan.pricingMode === "flexible" ? "Customize & see price" : "See plan & price"} →</Link>
    </article>
  );
}
