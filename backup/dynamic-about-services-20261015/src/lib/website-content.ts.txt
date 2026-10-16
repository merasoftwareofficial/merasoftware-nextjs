import type { HomepageContent } from "@/lib/repo/types";
export type ContentSection = { id: string; label: string; description: string; homeSection?: keyof HomepageContent; editor?: { href: string; label: string }; reference?: { href: string; label: string } };
export type ContentPage = { id: string; label: string; href: string; sections: ContentSection[] };
export const CONTENT_PAGES: ContentPage[] = [
  { id: "home", label: "Home", href: "/", sections: [
    { id: "hero", label: "Hero", description: "Eyebrow, heading, description and buttons.", homeSection: "hero" },
    { id: "marquee", label: "Moving service strip", description: "Scrolling service names.", homeSection: "marquee" },
    { id: "services", label: "Services", description: "Section heading and service summaries.", homeSection: "services" },
    { id: "pointOfView", label: "Point of view", description: "Heading and description.", homeSection: "pointOfView" },
    { id: "work", label: "Selected work", description: "Section copy. Published featured projects come from Portfolio.", homeSection: "work", editor: { href: "/admin/portfolio", label: "Manage projects" } },
    { id: "insights", label: "Journal", description: "Section copy. Published articles come from Blog posts.", homeSection: "insights", editor: { href: "/admin/blog", label: "Manage articles" } },
    { id: "contact", label: "Contact CTA", description: "Heading and conversation button.", homeSection: "contact" },
    { id: "promotion-links", label: "Packages & offers links", description: "Supporting sentences and links within Services and Contact CTA." },
  ] },
  { id: "about", label: "About", href: "/about", sections: [
    { id: "hero", label: "Hero", description: "Eyebrow, heading and introduction." },
    { id: "values", label: "Values", description: "Clear, Curious and Accountable value statements." },
  ] },
  { id: "services", label: "Services", href: "/services", sections: [
    { id: "intro", label: "Listing introduction", description: "Eyebrow, heading and description." },
    { id: "cards", label: "Service cards", description: "Service names and summaries.", reference: { href: "/admin/services", label: "View service list & SEO links" } },
  ] },
  ...[
    ["website-development", "Website development"], ["seo", "SEO"], ["performance-marketing", "Performance marketing"],
  ].map(([id, label]) => ({ id, label, href: `/services/${id}`, sections: [
    { id: "hero", label: "Hero", description: "Service eyebrow, heading and description." },
    { id: "included", label: "What's included", description: "Included services, supporting copy and contact action." },
  ] })),
  { id: "contact", label: "Contact", href: "/contact", sections: [
    { id: "hero", label: "Hero & contact action", description: "Heading, introduction and enquiry email." },
    { id: "faq", label: "FAQs", description: "Questions and answers displayed on Contact." },
  ] },
  ...[["blog", "Blog", "/blog"], ["community", "Community", "/community"], ["discussions", "Discussions", "/discussions"], ["newsletter", "Newsletter", "/subscribe"]].map(([id, label, href]) => ({ id, label, href, sections: [
    { id: "hero", label: "Page introduction", description: "Eyebrow, heading and introduction." },
  ] })),
  { id: "work", label: "Work", href: "/work", sections: [
    { id: "intro", label: "Page introduction", description: "Eyebrow, heading and introduction." },
    { id: "projects", label: "Projects", description: "Published projects and service work.", editor: { href: "/admin/portfolio", label: "Manage projects" } },
  ] },
  { id: "privacy", label: "Privacy", href: "/privacy", sections: [
    { id: "policy", label: "Privacy policy", description: "Privacy policy text and contact information." },
  ] },
  { id: "offers", label: "Offers", href: "/offer", sections: [
    { id: "listing", label: "Offer listing", description: "Directory heading, card descriptions and previews." },
    { id: "details", label: "Manage offers", description: "Create, preview and publish offers. Edit content, benefits, prices, expiry and enquiry actions." },
    { id: "terms", label: "Common & offer T&C", description: "Universal, offer-specific and combined terms." },
  ] },
  { id: "packages", label: "Packages", href: "/campaign/packages", sections: [
    { id: "intro", label: "Introduction", description: "Heading, description and offers link." },
    { id: "plans", label: "Package details", description: "Categories, inclusions, pricing and quotation notes.", reference: { href: "/admin/packages", label: "Open package reference" } },
  ] },
  { id: "shared", label: "Shared content", href: "/", sections: [
    { id: "header", label: "Header navigation", description: "Website navigation labels and contact CTA." },
    { id: "footer", label: "Footer", description: "Business description, links and contact information." },
    { id: "business", label: "Business contact details", description: "Public contact email and business details. Settings currently has no working business-details editor." },
    { id: "testimonials", label: "Testimonials", description: "Client quotes. The existing testimonial form is not connected to saving." },
  ] },
];
