import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { portfolioRepo } from "../src/lib/portfolio/repo";
import { publicPortfolio, isPublicPortfolio, sameUrl, type PortfolioEntry, type PortfolioSource } from "../src/lib/portfolio/types";
import { editorialSchema, sourceSchema } from "../src/lib/portfolio/rules";
import { sourceStatusText } from "../src/lib/portfolio/source-status";
import { groupPortfolioByClient } from "../src/lib/portfolio/client-groups";
import { PortfolioModel } from "../src/models/Portfolio";

let database: MongoMemoryServer;
const originalCwd = process.cwd();
let directory: string;
before(async () => {
  directory = mkdtempSync(path.join(os.tmpdir(), "portfolio-tests-"));
  process.chdir(directory);
  database = new MongoMemoryServer({ instance: { launchTimeout: 60_000 } });
  await database.start();
  process.env.MONGODB_URI = database.getUri(); process.env.MONGODB_DB = "portfolio_test";
});
after(async () => {
  process.chdir(originalCwd); await mongoose.disconnect(); if (database) await database.stop();
  if (directory) {
    assert.ok(path.resolve(directory).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    assert.ok(path.basename(directory).startsWith("portfolio-tests-"));
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
const source = (id: string, revision: number): PortfolioSource => ({ id, revision, available: true, type: "project", customerId: "private-id", customerName: "Private client", name: "Source project", category: "websites", state: "completed", linkedProjectId: "", url: "https://example.com", captureAllowed: true });
for (const driver of ["json", "mongo"]) {
  test(`${driver}: a URL saved to the portal is mirrored, queues screenshots once and survives the next sync`, async () => {
    process.env.DATA_DRIVER = driver;
    const id = driver === "json" ? "7".repeat(24) : "8".repeat(24);
    await portfolioRepo.sync({ ...source(id, 100), url: "" });
    assert.equal((await portfolioRepo.find(id))!.capture.status, "idle");
    const applied = (await portfolioRepo.applyPortalUrl(id, "https://client.example/"))!;
    assert.equal(applied.source.url, "https://client.example/"); assert.equal(applied.source.revision, 100);
    assert.equal(applied.capture.status, "queued");
    await portfolioRepo.sync({ ...source(id, 200), url: "https://client.example/" });
    const synced = (await portfolioRepo.find(id))!;
    assert.equal(synced.capture.token, applied.capture.token, "the same URL from the portal must not queue a second capture");
    await portfolioRepo.sync({ ...source(id, 300), url: "https://client.example/", captureAllowed: false }); // leave no queued job for later tests
  });
  test(`${driver}: progress and order date are stored for admin identification`, async () => {
    process.env.DATA_DRIVER = driver;
    const id = driver === "json" ? "e".repeat(24) : "f".repeat(24);
    await portfolioRepo.sync({ ...source(id, 100), url: "", state: "in_progress", progress: 40, orderedAt: "2026-10-12T05:00:00.000Z" });
    const entry = (await portfolioRepo.find(id))!;
    assert.equal(entry.source.progress, 40); assert.equal(entry.source.orderedAt, "2026-10-12T05:00:00.000Z");
    assert.equal(JSON.stringify(publicPortfolio(entry)).includes("2026-10-12"), false);
  });
  test(`${driver}: sync preserves editorial content, deduplicates events and ignores old revisions`, async () => {
    process.env.DATA_DRIVER = driver;
    const id = driver === "json" ? "a".repeat(24) : "b".repeat(24);
    await portfolioRepo.sync(source(id, 100));
    const imported = (await portfolioRepo.find(id))!;
    assert.equal(imported.status, "draft"); assert.equal(imported.capture.status, "queued");
    const cover = { assetId: "manual", url: "https://example.com/manual.jpg", alt: "Manual cover", focalX: 50, focalY: 0 };
    await portfolioRepo.update(id, { title: "Edited title", status: "hidden", cover, liveUrl: "https://example.org", summary: "Public summary" });
    await portfolioRepo.sync({ ...source(id, 200), name: "New source name" });
    await portfolioRepo.sync({ ...source(id, 150), name: "Old event" });
    await portfolioRepo.sync(source(id, 200));
    const entry = (await portfolioRepo.find(id))!;
    assert.equal(entry.title, "Edited title"); assert.equal(entry.source.name, "New source name"); assert.equal(entry.status, "hidden"); assert.deepEqual(entry.cover, cover);
    assert.equal((await portfolioRepo.list()).filter(row => row._id === id).length, 1);
    const publicRow = publicPortfolio(entry);
    assert.equal("source" in publicRow, false); assert.equal(JSON.stringify(publicRow).includes("Private client"), false);
    assert.equal(editorialSchema.safeParse({ ...entry, services: [""], status: "invalid" }).success, false);
  });
  test(`${driver}: capture refresh requires review and stale completion cannot overwrite a newer job`, async () => {
    process.env.DATA_DRIVER = driver;
    const id = driver === "json" ? "a".repeat(24) : "b".repeat(24);
    await portfolioRepo.queueCapture(id, "https://example.com");
    const claimed = (await portfolioRepo.claimCapture())!; assert.equal(claimed._id, id);
    await portfolioRepo.queueCapture(id, "https://example.org");
    assert.equal(await portfolioRepo.finishCapture(id, claimed.capture.token, []), false);
    const second = (await portfolioRepo.claimCapture())!;
    const images = [{ assetId: "captured", url: "https://example.com/captured.jpg", alt: "Screenshot", focalX: 50, focalY: 0 }];
    assert.equal(await portfolioRepo.finishCapture(id, second.capture.token, images), true);
    const ready = (await portfolioRepo.find(id))!;
    assert.equal(ready.cover!.assetId, "manual"); assert.equal(ready.capture.candidates[0].assetId, "captured");
    await portfolioRepo.queueCapture(id, "https://example.org");
    const failure = (await portfolioRepo.claimCapture())!;
    assert.equal(await portfolioRepo.finishCapture(id, failure.capture.token, [], "Capture failed"), true);
    assert.equal((await portfolioRepo.find(id))!.capture.status, "queued");
  });
  test(`${driver}: repeated and concurrent reaction requests keep accurate totals`, async () => {
    process.env.DATA_DRIVER = driver;
    const id = driver === "json" ? "a".repeat(24) : "b".repeat(24);
    await Promise.all(Array.from({ length: 12 }, () => portfolioRepo.setReaction(id, "user-1", "like", true)));
    assert.equal((await portfolioRepo.reactions(id)).counts.like, 1);
    await portfolioRepo.setReaction(id, "user-2", "like", true);
    await portfolioRepo.setReaction(id, "user-1", "impressive", true);
    await Promise.all(Array.from({ length: 12 }, () => portfolioRepo.setReaction(id, "user-1", "like", false)));
    const result = await portfolioRepo.reactions(id, "user-1");
    assert.equal(result.counts.like, 1); assert.equal(result.counts.impressive, 1); assert.deepEqual(result.mine, ["impressive"]);
  });
  test(`${driver}: missing sources are hidden without deleting content or reactions`, async () => {
    process.env.DATA_DRIVER = driver;
    const id = driver === "json" ? "a".repeat(24) : "b".repeat(24);
    await portfolioRepo.update(id, { status: "published" });
    assert.equal(isPublicPortfolio((await portfolioRepo.find(id))!), true);
    await portfolioRepo.sync({ ...source(id, 300), available: false, captureAllowed: false });
    const missing = (await portfolioRepo.find(id))!;
    assert.equal(missing.status, "hidden"); assert.equal(missing.title, "Edited title"); assert.equal(isPublicPortfolio(missing), false);
    assert.equal(await portfolioRepo.update(id, { status: "published" }), null);
    assert.equal((await portfolioRepo.reactions(id)).counts.impressive, 1);
  });
}
test("mongo: expired claims get a new token and simultaneous initial imports converge", async () => {
  process.env.DATA_DRIVER = "mongo";
  const id = "c".repeat(24);
  await Promise.all([portfolioRepo.sync(source(id, 400)), portfolioRepo.sync({ ...source(id, 500), name: "Latest" })]);
  assert.equal((await portfolioRepo.find(id))!.source.revision, 500);
  const first = (await portfolioRepo.claimCapture())!;
  await PortfolioModel.updateOne({ _id: id }, { $set: { "capture.leaseUntil": 0 } });
  const next = (await portfolioRepo.claimCapture())!;
  assert.notEqual(first.capture.token, next.capture.token);
  assert.equal(await portfolioRepo.finishCapture(id, first.capture.token, []), false);
});
test("source schema accepts deliveries with and without the admin identification fields", () => {
  assert.equal(sourceSchema.safeParse(source("c".repeat(24), 1)).success, true);
  assert.equal(sourceSchema.safeParse({ ...source("c".repeat(24), 1), progress: null, orderedAt: "2026-10-12T05:00:00.000Z" }).success, true);
  assert.equal(sourceSchema.safeParse({ ...source("c".repeat(24), 1), progress: 140 }).success, false);
});
test("progress text is a percentage while running, Completed when done, one word otherwise", () => {
  const base = source("c".repeat(24), 1);
  assert.equal(sourceStatusText({ ...base, state: "in_progress", progress: 40 }), "40%");
  assert.equal(sourceStatusText({ ...base, state: "approved_not_started", progress: 0 }), "0%");
  assert.equal(sourceStatusText({ ...base, state: "completed", progress: 100 }), "Completed");
  assert.equal(sourceStatusText({ ...base, state: "cancelled", progress: 60 }), "Cancelled");
  assert.equal(sourceStatusText({ ...base, type: "service", state: "plan_active", progress: null }), "Active");
  assert.equal(sourceStatusText({ ...base, state: "in_progress" }), "In progress");
  assert.equal(sourceStatusText({ ...base, available: false }), "Source unavailable");
});
test("admin list groups by client, newest client first, linked services under their project", () => {
  const row = (id: string, customerId: string, orderedAt: string, extra: Partial<PortfolioSource> = {}) => ({ _id: id, createdAt: "2026-01-01T00:00:00.000Z", status: "draft", source: { ...source(id, 1), customerId, customerName: customerId.toUpperCase(), orderedAt, ...extra } }) as unknown as PortfolioEntry;
  const groups = groupPortfolioByClient([
    row("1".repeat(24), "old", "2026-09-01T00:00:00.000Z"),
    row("2".repeat(24), "new", "2026-10-01T00:00:00.000Z"),
    row("3".repeat(24), "new", "2026-11-01T00:00:00.000Z", { type: "service", linkedProjectId: "2".repeat(24) }),
    row("4".repeat(24), "new", "2026-10-20T00:00:00.000Z"),
  ]);
  assert.deepEqual(groups.map(group => group.customerName), ["NEW", "OLD"]);
  assert.deepEqual(groups[0].rows.map(entry => entry._id[0]), ["4", "2", "3"]);
  assert.equal(groups[0].projects, 2); assert.equal(groups[0].services, 1);
});
test("public live link follows the portal URL, the toggle and older entries' saved link", () => {
  const entry = (patch: Partial<PortfolioEntry>, url = "") => ({ liveUrl: "", source: { ...source("c".repeat(24), 1), url }, ...patch }) as unknown as PortfolioEntry;
  assert.equal(publicPortfolio(entry({ showLiveUrl: true }, "https://portal.example/")).liveUrl, "https://portal.example/");
  assert.equal(publicPortfolio(entry({ showLiveUrl: false }, "https://portal.example/")).liveUrl, "");
  assert.equal(publicPortfolio(entry({ liveUrl: "https://old.example" })).liveUrl, "https://old.example");
  assert.equal(publicPortfolio(entry({}, "https://portal.example/")).liveUrl, "", "older entries without a saved link stay without one");
  assert.equal(sameUrl("https://site.example", "https://site.example/"), true);
  assert.equal(sameUrl("", "https://site.example/"), false);
});
