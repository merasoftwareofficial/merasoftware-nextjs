import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { DEFAULT_ABOUT, DEFAULT_SERVICES, aboutSchemas, servicesSchemas, resolveAbout, resolveServices, memberSlot, sectionSchema, sectionVisualIds, contentHref } from "../src/lib/page-content";
import { defaultVisual, slotInfo } from "../src/lib/visual-slots";
import { normaliseVisual, visualSchema } from "../src/lib/visual-validation";
import { DEFAULT_CROP, mediaGeometry, recommendedFrame, resolveCrop } from "../src/lib/visual-layout";
import type { DataDriver, MediaAsset } from "../src/lib/repo/types";

const originalCwd = process.cwd();
let directory: string;
let database: MongoMemoryServer;
let drivers: DataDriver[];
before(async () => {
  directory = mkdtempSync(path.join(os.tmpdir(), "page-content-tests-"));
  process.chdir(directory);
  database = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  process.env.MONGODB_URI = database.getUri();
  process.env.MONGODB_DB = "page_content_test";
  drivers = [(await import("../src/lib/repo/json-driver")).jsonDriver, (await import("../src/lib/repo/mongo-driver")).mongoDriver];
});
after(async () => {
  process.chdir(originalCwd);
  await mongoose.disconnect();
  if (database) await database.stop();
  if (directory) {
    assert.ok(path.resolve(directory).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    assert.ok(path.basename(directory).startsWith("page-content-tests-"));
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

test("Approved defaults and stable media IDs survive entry reordering", () => {
  assert.equal(resolveAbout({}).hero.heading, "Built around business.");
  assert.equal(resolveServices({}).catalogue.groups.flatMap(group => group.items).length, 6);
  assert.equal(sectionSchema("about", "__proto__"), undefined);
  const reordered = { ...DEFAULT_ABOUT.leadership, members: [...DEFAULT_ABOUT.leadership.members].reverse() };
  assert.deepEqual(sectionVisualIds("about", "leadership", reordered), ["about.deep", "about.sahilpreet", "about.jasmeet"]);
  assert.ok(slotInfo(memberSlot("new-person")));
  assert.equal(memberSlot("constructor"), "about.person.constructor");
  assert.equal(aboutSchemas.leadership.safeParse({ ...reordered, members: [reordered.members[0], reordered.members[0]] }).success, false);
  const groups = structuredClone(DEFAULT_SERVICES.catalogue);
  groups.groups[1].items.push(groups.groups[0].items[0]);
  assert.equal(servicesSchemas.catalogue.safeParse(groups).success, false);
});

test("Reject executable links, unknown fields and invalid lengths; retain valid content", () => {
  for (const href of ["javascript:alert(1)", "data:text/html,x", "//example.com", "/\\example.com"]) assert.equal(contentHref.safeParse(href).success, false, href);
  for (const href of ["/contact", "https://example.com", "mailto:hello@example.com", "tel:+123456789", ""]) assert.ok(contentHref.safeParse(href).success, href);
  assert.equal(aboutSchemas.hero.safeParse({ ...DEFAULT_ABOUT.hero, hiddenAdminFlag: true }).success, false);
  assert.equal(aboutSchemas.hero.safeParse({ ...DEFAULT_ABOUT.hero, lead: "a".repeat(1201) }).success, false);
});

test("Original frame proportions support images and videos without changing defaults", () => {
  const config = { ...defaultVisual("about.hero"), mode: "media" as const, assetId: "image", frameShape: "source" as const };
  assert.equal(normaliseVisual({ ...config }, { width: 900, height: 1200, kind: "image" } as MediaAsset).frameShape, "source");
  assert.equal(normaliseVisual({ ...config }, { width: 0, height: 0, kind: "video" } as MediaAsset).frameShape, "slot");
  assert.equal(defaultVisual("home.hero").frameShape, "slot");
});

test("Frame crop geometry keeps source proportions, clamps filled crops and permits free movement", () => {
  const frame = { width: 280, height: 350 }, image = { width: 900, height: 1200 };
  const fill = mediaGeometry(frame, image, "cover", { ...DEFAULT_CROP, x: 200, y: -200 });
  assert.equal(fill.width, 280);
  assert.ok(fill.height >= 350);
  assert.equal(fill.x, 0);
  assert.equal(fill.y, -fill.limitY);
  assert.ok(Math.abs(fill.width / fill.height - image.width / image.height) < 1e-10);
  const fit = mediaGeometry(frame, image, "contain", DEFAULT_CROP);
  assert.ok(fit.width <= frame.width && fit.height <= frame.height);
  const free = mediaGeometry(frame, image, "cover", { zoom: .5, x: 150, y: -120, free: true });
  assert.equal(free.x, 150); assert.equal(free.y, -120); assert.equal(free.width, 140);
  const covered = mediaGeometry(frame, image, "cover", { zoom: .2, x: 150, y: -120, free: false });
  assert.equal(covered.width, 280);
  const zoomed = mediaGeometry(frame, image, "cover", { ...DEFAULT_CROP, zoom: 2, x: 40 });
  assert.equal(zoomed.width, 560); assert.equal(zoomed.x, 40);
  const legacy = { ...defaultVisual("about.hero"), mode: "both" as const, focalX: 100, focalY: 0 };
  const crop = resolveCrop(legacy, frame, image as MediaAsset);
  const converted = mediaGeometry(frame, image, legacy.fit, crop);
  const oldBox = { width: frame.width * .72, height: frame.height * .74 };
  const old = mediaGeometry(oldBox, image, legacy.fit, DEFAULT_CROP);
  assert.ok(Math.abs(converted.width - old.width) < 1e-8);
  assert.ok(Math.abs(converted.x - (oldBox.width - old.width) / frame.width * 50) < 1e-8);
});

test("Validate responsive frame/crop settings and reject invalid dimensions and movement", () => {
  const config = { ...defaultVisual("about.hero"), frame: { ...recommendedFrame("about.hero"), mobile: { width: 260, height: 325 } }, crop: { zoom: 1.5, x: -25, y: 40, free: true } };
  assert.ok(visualSchema.safeParse(config).success);
  for (const frame of [{ ...config.frame, width: 0 }, { ...config.frame, height: 2401 }, { ...config.frame, radius: -1 }, { ...config.frame, mobile: { width: 260, height: Infinity } }]) assert.equal(visualSchema.safeParse({ ...config, frame }).success, false);
  for (const crop of [{ ...config.crop, zoom: 0 }, { ...config.crop, x: 201 }, { ...config.crop, y: NaN }]) assert.equal(visualSchema.safeParse({ ...config, crop }).success, false);
  assert.deepEqual(recommendedFrame("about.person.new"), { width: 280, height: 350, radius: 12 });
});

for (const index of [0, 1]) test(`${index === 0 ? "JSON" : "Mongo"}: save/reload and concurrent section/media writes preserve unrelated settings`, async () => {
  const repo = drivers[index].settings;
  await repo.update({ homepageContent: { hero: { marker: "homepage-preserved" } } as never, offers: { fixture: { marker: "offer-preserved" } } as never, organization: { logoUrl: "https://example.com/logo.png", sameAs: [] } });
  await Promise.all([
    repo.updatePageSection("about", "hero", { ...DEFAULT_ABOUT.hero, heading: "Saved about heading" }, { "about.hero": { ...defaultVisual("about.hero"), intensity: 37 } }),
    repo.updatePageSection("services", "contact", { ...DEFAULT_SERVICES.contact, heading: "Saved services CTA" }, {}),
    repo.updateVisual("services.apps", { ...defaultVisual("services.apps"), intensity: 81, frame: { width: 320, height: 400, radius: 12, mobile: { width: 260, height: 325 } }, crop: { zoom: 1.7, x: -20, y: 35, free: true } }),
  ]);
  const saved = await repo.get();
  assert.equal(resolveAbout(saved).hero.heading, "Saved about heading");
  assert.equal(resolveServices(saved).contact.heading, "Saved services CTA");
  assert.equal(resolveAbout(saved).purpose.heading, DEFAULT_ABOUT.purpose.heading);
  assert.equal(saved.sectionVisuals?.["about.hero"].intensity, 37);
  assert.equal(saved.sectionVisuals?.["services.apps"].intensity, 81);
  assert.deepEqual(saved.sectionVisuals?.["services.apps"].frame?.mobile, { width: 260, height: 325 });
  assert.deepEqual(saved.sectionVisuals?.["services.apps"].crop, { zoom: 1.7, x: -20, y: 35, free: true });
  assert.equal((saved.homepageContent?.hero as unknown as { marker: string }).marker, "homepage-preserved");
  assert.equal((saved.offers?.fixture as unknown as { marker: string }).marker, "offer-preserved");
  assert.equal(saved.organization?.logoUrl, "https://example.com/logo.png");
  assert.equal("about" in (saved.sectionVisuals ?? {}), false, "Visual IDs must retain literal dots");
  await repo.updatePageSection("about", "work", { ...DEFAULT_ABOUT.work, projects: [] }, {});
  assert.equal(resolveAbout(await repo.get()).work.projects.length, 0);
});
