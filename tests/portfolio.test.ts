import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { portfolioRepo } from "../src/lib/portfolio/repo";
import { publicPortfolio, isPublicPortfolio, type PortfolioSource } from "../src/lib/portfolio/types";
import { editorialSchema } from "../src/lib/portfolio/rules";
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
