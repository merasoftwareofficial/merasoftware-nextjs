import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_DEFAULT_SORT, ADMIN_SORT_KEY, readAdminSort, rememberAdminSort } from "../src/lib/package-sort-memory";

const memory = () => { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; };

test("a browser that never chose opens the admin list by recently modified", () => {
  assert.equal(ADMIN_DEFAULT_SORT, "modified");
  assert.equal(readAdminSort(memory()), "modified");
});

test("the sort the admin picked is the one used next time, whichever it is", () => {
  const storage = memory();
  for (const sort of ["price_asc", "price_desc", "added", "default", "modified"] as const) {
    rememberAdminSort(sort, storage);
    assert.equal(readAdminSort(storage), sort);
  }
});

test("anything else in storage opens by recently modified", () => {
  const storage = memory();
  storage.setItem(ADMIN_SORT_KEY, "alphabetical");
  assert.equal(readAdminSort(storage), "modified");
});

test("blocked storage never throws: reading gives recently modified, writing is ignored", () => {
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(readAdminSort(blocked), "modified");
  assert.doesNotThrow(() => rememberAdminSort("price_asc", blocked));
});
