import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { mongoDriver } from "../src/lib/repo/mongo-driver";
import { DEFAULT_OFFER } from "../src/lib/offers";

test("Mongo offer writes preserve settings, update independently and reject concurrent duplicate creates", async () => {
  const database = await MongoMemoryServer.create();
  const priorUri = process.env.MONGODB_URI;
  const priorName = process.env.MONGODB_DB;
  process.env.MONGODB_URI = database.getUri();
  process.env.MONGODB_DB = "offers_validation";
  try {
    assert.equal(await mongoDriver.settings.saveOffer(DEFAULT_OFFER, false), true);
    await mongoDriver.settings.update({ commentsEnabled: false });
    const results = await Promise.all([
      mongoDriver.settings.saveOffer({ ...DEFAULT_OFFER, slug: "one" }, true),
      mongoDriver.settings.saveOffer({ ...DEFAULT_OFFER, slug: "two" }, true),
    ]);
    assert.deepEqual(results, [true, true]);
    const duplicates = await Promise.all([
      mongoDriver.settings.saveOffer({ ...DEFAULT_OFFER, slug: "unique" }, true),
      mongoDriver.settings.saveOffer({ ...DEFAULT_OFFER, slug: "unique" }, true),
    ]);
    assert.equal(duplicates.filter(Boolean).length, 1);
    await Promise.all([
      mongoDriver.settings.update({ offerUniversalTerms: ["Common term"], offerListing: { title: "Seasonal offers", emptyMessage: "Check back soon." } }),
      mongoDriver.settings.saveOffer({ ...DEFAULT_OFFER, slug: "one", status: "archived" }, false),
    ]);
    const saved = await mongoDriver.settings.get();
    assert.equal(saved.commentsEnabled, false);
    assert.equal(saved.offers?.one.status, "archived");
    assert.equal(saved.offers?.two.title, DEFAULT_OFFER.title);
    assert.equal(saved.offers?.page.endsAt, "2026-10-20T23:59:59+05:30");
    assert.deepEqual(saved.offerUniversalTerms, ["Common term"]);
    assert.equal(saved.offerListing?.title, "Seasonal offers");
  } finally {
    await mongoose.disconnect();
    await database.stop();
    if (priorUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = priorUri;
    if (priorName === undefined) delete process.env.MONGODB_DB; else process.env.MONGODB_DB = priorName;
  }
});
