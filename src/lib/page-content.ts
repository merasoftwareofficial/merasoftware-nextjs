import { z } from "zod";
import defaults from "./page-content-defaults.json";
import type { Settings } from "@/lib/repo/types";
import { sectionSlots } from "@/lib/visual-slots";
export { memberSlot, projectSlot, serviceSlot } from "@/lib/visual-slots";

const text = (max = 300) => z.string().trim().max(max);
const id = z.string().regex(/^[a-z0-9-]{1,80}$/, "Use a stable lowercase entry ID.");
export const contentHref = text(500).refine(value => {
  if (!value) return true;
  if (value.startsWith("/")) return !value.startsWith("//") && !/[\\\s]/.test(value);
  if (/^mailto:[^\s@]+@[^\s@]+$/.test(value) || /^tel:\+?[\d()-]{5,30}$/.test(value)) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}, "Use a site path, HTTPS URL, email or phone link.");
const imageUrl = text(1000).refine(value => {
  if (!value) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}, "Use an HTTPS image URL, or choose media below.");
const base = { enabled: z.boolean(), eyebrow: text(100), heading: text(), emphasis: text(), lineBreak: z.boolean() };
const paragraphs = z.array(text(1500)).max(8);
const button = { buttonLabel: text(100), buttonHref: contentHref };
const unique = <T extends { id: string }>(items: T[]) => new Set(items.map(item => item.id)).size === items.length;

export const memberSchema = z.object({ id, name: text(100), position: text(100), role: text(150), description: text(1000) }).strict();
export const projectSchema = z.object({ id, brand: text(180), category: text(100), description: text(1000), href: contentHref, imageUrl, alt: text(300) }).strict();
export const serviceItemSchema = z.object({ id, title: text(180), description: text(1000), inclusions: z.array(text(300)).max(20), href: contentHref, action: text(100) }).strict();
export const groupSchema = z.object({ id, title: text(180), label: text(80), description: text(600), items: z.array(serviceItemSchema).max(20) }).strict();
export const aboutSchemas = {
  hero: z.object({ ...base, lead: text(1200), description: text(1200), ...button }).strict(),
  purpose: z.object({ ...base, paragraphs }).strict(),
  approach: z.object({ ...base, paragraphs, ...button }).strict(),
  leadership: z.object({ ...base, members: z.array(memberSchema).max(12).refine(unique, "Member IDs must be unique.") }).strict(),
  partnership: z.object({ ...base, paragraphs }).strict(),
  work: z.object({ ...base, projects: z.array(projectSchema).max(12).refine(unique, "Project IDs must be unique.") }).strict(),
  contact: z.object({ ...base, description: text(1000), ...button }).strict(),
};
export const servicesSchemas = {
  hero: z.object({ ...base, description: text(1200), previewImageUrl: imageUrl, previewAlt: text(), previewLabel: text(180), previewHref: contentHref }).strict(),
  catalogue: z.object({ enabled: z.boolean(), hint: text(300), groups: z.array(groupSchema).max(6) }).strict().refine(value => unique(value.groups) && unique(value.groups.flatMap(group => group.items)), "Group and service IDs must be unique."),
  contact: z.object({ enabled: z.boolean(), heading: text(), description: text(1000), ...button, secondaryLabel: text(100), secondaryHref: contentHref }).strict(),
};
export type AboutContent = { [K in keyof typeof aboutSchemas]: z.infer<(typeof aboutSchemas)[K]> };
export type ServicesContent = { [K in keyof typeof servicesSchemas]: z.infer<(typeof servicesSchemas)[K]> };
export type PageContent = { about?: Partial<AboutContent>; services?: Partial<ServicesContent> };
export type ManagedPage = "about" | "services";
export const DEFAULT_ABOUT: AboutContent = Object.fromEntries(Object.entries(aboutSchemas).map(([key, schema]) => [key, schema.parse(defaults.about[key as keyof AboutContent])])) as AboutContent;
export const DEFAULT_SERVICES: ServicesContent = Object.fromEntries(Object.entries(servicesSchemas).map(([key, schema]) => [key, schema.parse(defaults.services[key as keyof ServicesContent])])) as ServicesContent;
export function sectionSchema(page: ManagedPage, section: string): z.ZodType | undefined {
  const schemas: Record<string, z.ZodType> = page === "about" ? aboutSchemas : servicesSchemas;
  return Object.hasOwn(schemas, section) ? schemas[section] : undefined;
}
export function resolveAbout(settings: Pick<Settings, "pageContent">): AboutContent {
  return Object.fromEntries(Object.entries(aboutSchemas).map(([key, schema]) => [key, schema.parse({ ...DEFAULT_ABOUT[key as keyof AboutContent], ...settings.pageContent?.about?.[key as keyof AboutContent] })])) as AboutContent;
}
export function resolveServices(settings: Pick<Settings, "pageContent">): ServicesContent {
  return Object.fromEntries(Object.entries(servicesSchemas).map(([key, schema]) => [key, schema.parse({ ...DEFAULT_SERVICES[key as keyof ServicesContent], ...settings.pageContent?.services?.[key as keyof ServicesContent] })])) as ServicesContent;
}
export function sectionVisualIds(page: string, section: string, content?: unknown) {
  return sectionSlots(page, section, content).map(slot => slot.id);
}
export function sectionVisualOptions(page: ManagedPage, section: string, content: unknown) {
  return sectionSlots(page, section, content);
}
