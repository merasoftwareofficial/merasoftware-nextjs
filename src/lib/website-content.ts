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
    { id: "hero", label: "Hero", description: "Introduction, heading, button and main visual." },
    { id: "purpose", label: "Purpose", description: "Company purpose and supporting paragraphs." },
    { id: "approach", label: "Approach", description: "Business approach, link and visual." },
    { id: "leadership", label: "Leadership", description: "Team names, roles, descriptions, order and photos." },
    { id: "partnership", label: "Working with us", description: "Delivery, project visibility, support and visual." },
    { id: "work", label: "Selected work", description: "Project highlights, descriptions, destinations and images." },
    { id: "contact", label: "Closing CTA", description: "Closing heading, description and conversation button." },
  ] },
  { id: "services", label: "Services", href: "/services", sections: [
    { id: "hero", label: "Hero & preview", description: "Introduction, selected-work preview and main visual." },
    { id: "catalogue", label: "Service groups & entries", description: "Service groups, inclusions, links, order and media." },
    { id: "contact", label: "Packages & contact", description: "Closing message, packages link and project enquiry." },
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
  { id: "packages", label: "Packages", href: "/packages/one-time-packages", sections: [
    { id: "intro", label: "Package management", description: "Create and publish showcase packages linked to project categories, offers and the Pricing & Packages menu pages.", editor: { href: "/admin/packages", label: "Manage packages" } },
    { id: "plans", label: "Package details", description: "Included scope, prices, offers and related portal services.", editor: { href: "/admin/packages", label: "Manage packages" } },
  ] },
  { id: "shared", label: "Shared content", href: "/", sections: [
    { id: "header", label: "Header navigation", description: "Website navigation labels and contact CTA." },
    { id: "footer", label: "Footer", description: "Business description, links and contact information." },
    { id: "business", label: "Business contact details", description: "Public contact email and business details. Settings currently has no working business-details editor." },
    { id: "testimonials", label: "Testimonials", description: "Client quotes. The existing testimonial form is not connected to saving." },
  ] },
];
