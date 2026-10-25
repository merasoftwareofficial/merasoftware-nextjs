// Package pages (lib/package-pages.ts): the default list, slugs, and both repo drivers.
// Isolated: a temp folder for the JSON driver and in-memory MongoDB for the Mongo driver.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { DEFAULT_PACKAGE_PAGES, isPackagePageSlug, newPackagePageSchema, packagePagePath, packagePageSlug, resolvedPackagePages } from "../src/lib/package-pages";
import type { SettingsRepo } from "../src/lib/repo/types";

const monthly = { slug: "monthly-packages", title: "Monthly Packages", intro: "Ongoing monthly support packages.", order: 1 };

test("absent setting = the One-Time page; saved pages sort by order then title", () => {
  assert.deepEqual(resolvedPackagePages(undefined).map(page => page.slug), ["one-time-packages"]);
  assert.deepEqual(resolvedPackagePages({}), [], "a saved empty list stays empty");
  const saved = { b: { ...monthly, slug: "b", title: "B", order: 2 }, a: { ...monthly, slug: "a", title: "A", order: 2 }, first: { ...monthly, slug: "first", order: 0 } };
  assert.deepEqual(resolvedPackagePages(saved).map(page => page.slug), ["first", "a", "b"]);
  assert.equal(packagePagePath("business-solutions"), "/packages/business-solutions");
});

test("slug comes from the page name and must be URL-safe", () => {
  assert.equal(packagePageSlug("Business Solutions"), "business-solutions");
  assert.equal(packagePageSlug("  Monthly  Packages!! "), "monthly-packages");
  assert.equal(isPackagePageSlug(packagePageSlug("मासिक")), false, "a name without letters or numbers gives no usable link");
  for (const slug of ["Bad Slug", "a..b", "-a", "a-", "x".repeat(81)]) assert.equal(isPackagePageSlug(slug), false, slug);
  assert.equal(newPackagePageSchema.safeParse({ title: "Monthly", intro: "Short" }).success, false);
  assert.equal(newPackagePageSchema.safeParse({ title: "Monthly", intro: "Ongoing monthly plans.", slug: "x" }).success, false, "the slug is never sent");
});

async function driverRules(settings: SettingsRepo) {
  await settings.update({ commentsEnabled: false });
  assert.equal(await settings.savePackagePage(monthly), true);
  let pages = (await settings.get()).packagePages ?? {};
  assert.deepEqual(Object.keys(pages).sort(), ["monthly-packages", "one-time-packages"], "the first change keeps the default page");
  assert.equal(await settings.savePackagePage({ ...monthly, title: "Other" }), false, "a taken slug is refused");
  assert.equal(await settings.deletePackagePage("missing"), false);
  assert.equal(await settings.deletePackagePage("one-time-packages"), true);
  assert.equal(await settings.deletePackagePage("monthly-packages"), true);
  const saved = await settings.get();
  assert.deepEqual(saved.packagePages, {});
  assert.deepEqual(resolvedPackagePages(saved.packagePages), [], "deleting every page never brings the default back");
  assert.equal(saved.commentsEnabled, false, "other settings are kept");
}

test("JSON driver: create, refuse duplicates, delete, keep other settings", async () => {
  const previous = process.cwd();
  const folder = mkdtempSync(path.join(tmpdir(), "mera-package-pages-test-"));
  try {
    process.chdir(folder);
    const { jsonDriver } = await import("../src/lib/repo/json-driver");
    await driverRules(jsonDriver.settings);
  } finally { process.chdir(previous); }
});

test("Mongo driver: same rules, and a deleted default is not restored by a later create", async () => {
  const database = await MongoMemoryServer.create();
  const priorUri = process.env.MONGODB_URI;
  const priorName = process.env.MONGODB_DB;
  process.env.MONGODB_URI = database.getUri();
  process.env.MONGODB_DB = "package_pages_validation";
  try {
    const { mongoDriver } = await import("../src/lib/repo/mongo-driver");
    assert.equal((await mongoDriver.settings.get()).packagePages, undefined, "a fresh site has no saved pages");
    await driverRules(mongoDriver.settings);
    const both = await Promise.all([mongoDriver.settings.savePackagePage(monthly), mongoDriver.settings.savePackagePage(monthly)]);
    assert.equal(both.filter(Boolean).length, 1, "two admins creating the same page at once: one wins");
    assert.deepEqual(Object.keys((await mongoDriver.settings.get()).packagePages ?? {}), ["monthly-packages"]);
    assert.ok(DEFAULT_PACKAGE_PAGES["one-time-packages"]);
  } finally {
    await mongoose.disconnect();
    await database.stop();
    if (priorUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = priorUri;
    if (priorName === undefined) delete process.env.MONGODB_DB; else process.env.MONGODB_DB = priorName;
  }
});
