import assert from "node:assert/strict";
import { test } from "node:test";
import { pageGroup, pageName, pageStatus } from "../src/app/admin/page-seo/page-seo-groups";

test("each page key lands in one tab", () => {
  assert.equal(pageGroup("home"), "Main");
  assert.equal(pageGroup("offers"), "Main");
  assert.equal(pageGroup("terms"), "Main");
  assert.equal(pageGroup("service-seo"), "Services");
  assert.equal(pageGroup("packages-one-time-packages"), "Packages");
  assert.equal(pageGroup("package-abc123"), "Packages");
  assert.equal(pageGroup("package-abc123-customize"), "Packages");
  assert.equal(pageGroup("plans"), "Plans");
  assert.equal(pageGroup("plans-65f0c0"), "Plans");
  assert.equal(pageGroup("organization"), "Business");
});

test("the tab word is removed, so the page's own name is shown", () => {
  assert.equal(pageName("Service: Websites, apps and software"), "Websites, apps and software");
  assert.equal(pageName("Packages: One-Time Packages"), "One-Time Packages");
  assert.equal(pageName("Package: Digital Growth kit"), "Digital Growth kit");
  assert.equal(pageName("Plans: Live Chat Feature"), "Live Chat Feature");
  assert.equal(pageName("Terms & Conditions"), "Terms & Conditions");
});

test("a customize page says so at the end instead of a dot", () => {
  assert.equal(pageName("Package: Standard Website · customize"), "Standard Website (customize page)");
});

test("status: open issues first, then custom text, else built-in", () => {
  assert.equal(pageStatus(2, true), "todo");
  assert.equal(pageStatus(1, false), "todo");
  assert.equal(pageStatus(0, true), "custom");
  assert.equal(pageStatus(0, false), "builtin");
});
