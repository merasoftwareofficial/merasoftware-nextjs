import { z } from "zod";
export const webUrl = z.string().trim().max(2000).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}, "Enter a public http(s) URL without credentials.");
export const sourceSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/), revision: z.number().int().positive(),
  available: z.boolean(), type: z.enum(["project", "service"]),
  customerId: z.string().max(100), customerName: z.string().max(300),
  name: z.string().max(300), category: z.string().max(100), state: z.string().max(100),
  linkedProjectId: z.string().max(100), url: webUrl, captureAllowed: z.boolean(),
});
export const imageSchema = z.object({
  assetId: z.string().min(1).max(100), url: webUrl.refine(Boolean, "Choose an image."),
  alt: z.string().trim().min(1).max(300),
  focalX: z.number().min(0).max(100).default(50), focalY: z.number().min(0).max(100).default(0),
});
export const editorialSchema = z.object({
  title: z.string().trim().min(1).max(180),
  slug: z.string().trim().min(1).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  brand: z.string().trim().max(180), category: z.string().trim().max(100),
  summary: z.string().trim().max(400), problem: z.string().trim().max(12000),
  solution: z.string().trim().max(12000), result: z.string().trim().max(12000),
  services: z.array(z.string().trim().min(1).max(100)).max(30), liveUrl: webUrl,
  cover: imageSchema.nullable(), gallery: z.array(imageSchema).max(30),
  status: z.enum(["draft", "published", "hidden"]), featured: z.boolean(),
  sortOrder: z.number().int().min(-10000).max(10000),
});
