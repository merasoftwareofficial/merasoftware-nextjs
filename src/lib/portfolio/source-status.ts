import type { PortfolioSource } from "./types";

// Admin-only progress text shared by the list and editor: "40%" while work runs,
// "Completed" when done, one word for every other source state.
const words: Record<string, string> = {
  completed: "Completed", cancelled: "Cancelled", rejected: "Payment rejected",
  pending_approval: "Approval pending", payment_due: "Payment pending",
  plan_active: "Active", plan_closed: "Closed", processing: "Processing",
};

export function sourceStatusText(source: PortfolioSource): string {
  if (!source.available) return "Source unavailable";
  const running = source.state === "in_progress" || source.state === "approved_not_started";
  if (running && typeof source.progress === "number") return `${source.progress}%`;
  if (words[source.state]) return words[source.state];
  const text = source.state.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const isSourceCompleted = (source: PortfolioSource) => source.available && source.state === "completed";
