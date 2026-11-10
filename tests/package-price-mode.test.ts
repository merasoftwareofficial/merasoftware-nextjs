import assert from "node:assert/strict";
import test from "node:test";
import { PRICE_MODE_KEY, readPriceMode, rememberPriceMode } from "../src/lib/package-price-mode";

const memory = () => { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; };

test("a new package opens automatic until the admin chooses manual, then the last choice is used", () => {
  const storage = memory();
  assert.equal(readPriceMode(storage), "automatic");
  rememberPriceMode("manual", storage);
  assert.equal(readPriceMode(storage), "manual");
  rememberPriceMode("automatic", storage);
  assert.equal(readPriceMode(storage), "automatic");
});

test("anything else in storage is automatic", () => {
  const storage = memory();
  storage.setItem(PRICE_MODE_KEY, "yes");
  assert.equal(readPriceMode(storage), "automatic");
});

test("blocked storage never throws: reading gives automatic, writing is ignored", () => {
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(readPriceMode(blocked), "automatic");
  assert.doesNotThrow(() => rememberPriceMode("manual", blocked));
});
