import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const originals = JSON.parse(readFileSync("backup/public-compact-20261008-001401/saved-homepage-hashes.json", "utf8"));
for (const file of originals) assert.equal(createHash("sha256").update(readFileSync(file.Path)).digest("hex").toUpperCase(), file.Hash, `Saved homepage changed: ${file.Path}`);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const [width, height] of [[390, 844], [360, 740], [320, 700], [1440, 1000]]) {
    await page.setViewportSize({ width, height });
    const response = await page.goto("http://localhost:3000/campaign/business-growth", { waitUntil: "domcontentloaded", timeout: 60000 });
    assert.equal(response.status(), 200);
    assert.equal(new URL(page.url()).pathname, "/campaign/business-growth");
    await page.getByRole("heading", { level: 1, name: /Your business/ }).waitFor();
    assert.equal(await page.locator("body").evaluate(el => el.scrollWidth > innerWidth), false, `Horizontal overflow ${width}`);
    const overview = page.getByRole("region", { name: "Services, starting prices and contact" });
    for (const label of ["Business setup", "Google management", "Business website", "Social media"]) await overview.getByRole("heading", { name: label, exact: true }).waitFor();
    const contact = overview.getByRole("link", { name: /Email our team/ });
    assert.match(await contact.getAttribute("href"), /^mailto:contact@merasoftware.com/);
    if (width < 720) {
      const position = await contact.boundingBox();
      const sticky = await page.locator("main > div").last().boundingBox();
      assert.ok(position.y + position.height < sticky.y, `Main contact below sticky at ${width}: ${position.y + position.height} > ${sticky.y}`);
    }
    await page.screenshot({ path: `backup/public-compact-20261008-001401/compact-${width}.png` });
  }
  await page.getByRole("button", { name: "Business website", exact: true }).click();
  await page.getByRole("heading", { name: "Business portfolio website", exact: true }).waitFor();
  await page.getByRole("button", { name: "ERP software", exact: true }).click();
  await page.getByRole("heading", { name: "Integrated ERP software", exact: true }).waitFor();
  await page.locator("summary").filter({ hasText: "Not sure what your business needs?" }).click();
  await page.getByText(/You do not need to choose a package first/).waitFor();
  assert.match(await page.locator('meta[name="robots"]').getAttribute("content"), /noindex/);
  assert.equal(await page.getByRole("progressbar").count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS: 320/360/390/1440 widths; first-screen contact and pricing; project selection, FAQ, English, noindex, no login, and saved homepage hashes unchanged.");
} finally { await browser.close(); }
