import { z } from "zod";
import type { HomepageContent } from "@/lib/repo/types";

/** The original homepage copy is the fallback until an editor saves a change. */
export const DEFAULT_HOMEPAGE_CONTENT: HomepageContent = {
  hero: {
    eyebrow: "DIGITAL GROWTH PARTNER",
    headingBefore: "Make your digital presence",
    headingEmphasis: "impossible",
    headingAfter: "to ignore.",
    description: "We help ambitious businesses build sharper websites, win meaningful visibility, and turn attention into growth.",
    primaryLabel: "Start a project",
    primaryHref: "/contact",
    secondaryLabel: "Explore our work",
    secondaryHref: "/services",
    signalLabel: "DIGITAL SIGNAL",
    signalPrimary: "01",
    signalSecondary: "01",
  },
  marquee: ["WEB DEVELOPMENT", "SEARCH ENGINE OPTIMISATION", "PERFORMANCE MARKETING", "BRAND GROWTH"],
  services: {
    eyebrow: "WHAT WE DO",
    sideNote: "A compact, senior team for businesses ready to move with purpose.",
    headingBefore: "Built for the work that",
    headingEmphasis: "moves",
    headingAfter: "your business forward.",
    items: [
      { slug: "website-development", title: "Websites built to earn attention", description: "Strategic, fast and expressive websites that put your business in a stronger position online." },
      { slug: "seo", title: "Search visibility with real commercial intent.", description: "We connect technical foundations, useful content and search strategy so your next customers can find you." },
      { slug: "performance-marketing", title: "Campaigns designed around outcomes, not vanity metrics.", description: "Paid growth systems that bring the right traffic in, learn quickly and spend with discipline." },
    ],
  },
  pointOfView: {
    eyebrow: "OUR POINT OF VIEW",
    headingLineOne: "Growth is not a lucky break.",
    headingBefore: "It's a system with",
    headingEmphasis: "intention",
    headingAfter: ".",
    description: "Every decision connects: the story your website tells, the search terms you own, and the campaigns that bring customers in.",
  },
  work: {
    eyebrow: "SELECTED WORK",
    allLabel: "See all work",
    headingBefore: "Good work should feel",
    headingEmphasis: "good",
    headingAfter: "for business.",
    cards: [
      { tag: "WEB + SEO", titleLineOne: "Northstar", titleLineTwo: "Advisory", description: "A more confident digital home for a growing consultancy." },
      { tag: "PAID GROWTH", titleLineOne: "Oasis", titleLineTwo: "Living", description: "A focused acquisition system built around qualified enquiries." },
    ],
  },
  insights: {
    eyebrow: "FROM THE JOURNAL",
    allLabel: "All insights",
    headingBefore: "Useful thinking for the next",
    headingEmphasis: "move",
    headingAfter: ".",
    fallbackLineOne: "IDEAS WITH",
    fallbackLineTwo: "COMMERCIAL INTENT",
  },
  contact: {
    eyebrow: "READY WHEN YOU ARE",
    headingLineOne: "Let's build the next",
    headingEmphasis: "good thing.",
    buttonLabel: "Start a conversation",
    buttonHref: "/contact",
  },
};

const copy = (max: number) => z.string().trim().max(max);
const href = z.string().trim().min(1).max(300).refine(
  value => (value.startsWith("/") && !value.startsWith("//")) || value.startsWith("https://") || value.startsWith("mailto:"),
  "Use a site path, HTTPS link or email link.",
);

export const homepageContentSchema = z.object({
  hero: z.object({
    eyebrow: copy(100), headingBefore: copy(180), headingEmphasis: copy(100), headingAfter: copy(180),
    description: copy(600), primaryLabel: copy(100), primaryHref: href, secondaryLabel: copy(100), secondaryHref: href,
    signalLabel: copy(100), signalPrimary: copy(20), signalSecondary: copy(20),
  }).strict(),
  marquee: z.array(copy(80)).length(4),
  services: z.object({
    eyebrow: copy(100), sideNote: copy(400), headingBefore: copy(180), headingEmphasis: copy(100), headingAfter: copy(180),
    items: z.array(z.object({ slug: z.enum(["website-development", "seo", "performance-marketing"]), title: copy(180), description: copy(400) }).strict()).length(3),
  }).strict(),
  pointOfView: z.object({
    eyebrow: copy(100), headingLineOne: copy(180), headingBefore: copy(180), headingEmphasis: copy(100), headingAfter: copy(100), description: copy(600),
  }).strict(),
  work: z.object({
    eyebrow: copy(100), allLabel: copy(100), headingBefore: copy(180), headingEmphasis: copy(100), headingAfter: copy(180),
    cards: z.array(z.object({ tag: copy(100), titleLineOne: copy(100), titleLineTwo: copy(100), description: copy(400) }).strict()).length(2),
  }).strict(),
  insights: z.object({ eyebrow: copy(100), allLabel: copy(100), headingBefore: copy(180), headingEmphasis: copy(100), headingAfter: copy(100), fallbackLineOne: copy(100), fallbackLineTwo: copy(100) }).strict(),
  contact: z.object({ eyebrow: copy(100), headingLineOne: copy(180), headingEmphasis: copy(120), buttonLabel: copy(100), buttonHref: href }).strict(),
}).strict();

export function resolveHomepageContent(content?: HomepageContent): HomepageContent {
  return content ?? DEFAULT_HOMEPAGE_CONTENT;
}
