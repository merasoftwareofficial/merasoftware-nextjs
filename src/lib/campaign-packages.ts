export type Category = "setup" | "social" | "combined" | "website";
export type Package = { id: string; name: string; category: Category; price: number; cadence: string; bestFor: string; features: string[]; reels?: number; photos?: number; shoots?: string; website?: string; notes: string[] };
export const categories: Record<Category, string> = { setup: "Setup & Google visibility", social: "Social media management", combined: "Social media + website", website: "Website only" };
const setup = ["Google Business Profile, Facebook, Instagram & WhatsApp Business setup", "Business information & profile optimization", "Professional profile & cover banners", "Platform interlinking", "Contact details & category-specific setup"];
const social = ["Platform setup included (worth ₹2,500)", "Instagram, Facebook & Google Business Profile management", "Festival stories", "Content creation, designing & posting", "Captions & relevant hashtags", "Ad banner creation", "Competitor analysis & improvement suggestions", "Monthly performance review"];
const website = ["Up to 7 pages", "Professional business-focused design", "Mobile responsive layout"];
const raw = ["Client provides raw photos, videos & business information."];
const pending = ["Confirm taxes, commitment, delivery schedule & cancellation terms before payment."];
function socialPlan(id: string, name: string, price: number, reels: number, photos: number, shoots: string, extra: string[], bestFor: string): Package {
  return { id, name, category: "social", price, cadence: "/ month", bestFor, reels, photos, shoots, features: [...social, `${reels} reels / month`, `${photos} photo posts / month`, ...(shoots !== "Not included" ? [`${shoots} content shoots / month`] : []), ...extra], notes: [...(shoots === "Not included" ? raw : ["Confirm shoot location, duration & travel charges."]), ...pending] };
}
const premium = socialPlan("premium", "Premium", 15000, 8, 8, "Up to 4", ["Interactive Q&A & poll stories", "Up to ₹2,000 ad budget included"], "Content shoots, engagement activities & included ad budget");
export const packages: Package[] = [
  { id: "setup", name: "Business Platform Setup", category: "setup", price: 2500, cadence: "one-time", bestFor: "Businesses needing their online profiles set up", features: setup, notes: ["Ongoing management is a separate service.", ...pending] },
  { id: "gbp", name: "GBP Management & Ranking", category: "setup", price: 900, cadence: "/ month", bestFor: "Businesses focusing on Google Business Profile visibility", features: ["Google Business Profile management & optimization", "Ranking improvement work", "Weekly posts", "Regular business updates", "Profile monitoring", "₹2,000 for 3 months also available"], notes: ["Ranking improvement is an objective, not a guaranteed position.", ...pending] },
  socialPlan("basic", "Basic", 6000, 4, 4, "Not included", [], "Consistent social presence using client-provided content"),
  socialPlan("growth", "Growth", 7000, 6, 4, "Not included", [], "More reels using client-provided content"),
  socialPlan("growth-plus", "Growth Plus", 8000, 8, 4, "Not included", [], "Frequent reels using client-provided content"),
  socialPlan("professional", "Professional", 10000, 8, 8, "1", [], "A monthly shoot and more photo posts"),
  socialPlan("professional-plus", "Professional Plus", 12000, 8, 8, "2", ["Interactive Q&A stories", "Poll stories"], "Two shoots with interactive audience content"),
  premium,
  { ...premium, id: "complete", name: "Business Complete", category: "combined", price: 20000, website: "Static", bestFor: "Social media management plus a business showcase website", features: [...premium.features, "Static website creation — up to 7 pages", "Website updates & maintenance", "SEO"], notes: [...premium.notes, "Confirm website commitment, ownership, domain/hosting, update limits & SEO scope."] },
  { ...premium, id: "pro", name: "Business Pro", category: "combined", price: 30000, website: "Dynamic", bestFor: "Social media management plus dynamic website functionality", features: [...premium.features, "Dynamic website creation — up to 7 pages", "Website updates & maintenance", "SEO"], notes: [...premium.notes, "Confirm dynamic features, website commitment, ownership, domain/hosting, update limits & SEO scope."] },
  { id: "static", name: "Static Website", category: "website", price: 6000, cadence: "website price", website: "Static", bestFor: "Showcasing your business, services & contact information", features: [...website, "Business information & services presentation", "Additional pages: ₹1,000 / page"], notes: ["Confirm payment schedule, domain/hosting, maintenance & delivery time.", ...pending] },
  { id: "dynamic", name: "Dynamic Website", category: "website", price: 20000, cadence: "website price", website: "Dynamic", bestFor: "Dynamic content and flexibility for future growth", features: [...website, "Dynamic content functionality", "Scalable website structure", "Additional pages: ₹2,000 / page"], notes: ["Confirm exact dynamic features, payment schedule, domain/hosting, maintenance & delivery time.", ...pending] },
];
export const money = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;
export type Answers = { need: string; preference: string; budget: number };
export function recommend(a: Answers): { plan: Package; reason: string; overBudget: boolean } {
  let id = "setup";
  let reason = "You want your business profiles professionally set up.";
  if (a.need === "google") { id = "gbp"; reason = "Your priority is ongoing Google Business Profile visibility."; }
  if (a.need === "website" || a.need === "combined") {
    id = a.need === "combined" ? (a.preference === "dynamic" ? "pro" : "complete") : (a.preference === "dynamic" ? "dynamic" : "static");
    reason = a.preference === "dynamic" ? "You need dynamic website functionality; the exact features will be confirmed together." : "You need a website to present your business and services.";
    if (a.need === "combined") reason += " This plan also includes social management, content shoots and ad budget.";
  }
  if (a.need === "social") {
    const choices = packages.filter(p => p.category === "social" && (a.preference === "raw" ? p.shoots === "Not included" : a.preference === "shoot" ? ["professional", "professional-plus"].includes(p.id) : p.id === "premium"));
    id = ([...choices].reverse().find(p => p.price <= a.budget) ?? choices[0]).id;
    reason = a.preference === "raw" ? "You can provide raw content. This matches your stated monthly budget and content needs." : a.preference === "shoot" ? "You need content shoots included in your social media plan." : "You want content shoots and an included advertising budget.";
  }
  const plan = packages.find(p => p.id === id)!;
  return { plan, reason, overBudget: plan.price > a.budget };
}
