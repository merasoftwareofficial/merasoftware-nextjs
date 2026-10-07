import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const saved = JSON.parse(readFileSync("backup/public-offer-20261008-003450/homepage-hashes.json", "utf8"));
for (const file of saved) assert.equal(createHash("sha256").update(readFileSync(file.Path)).digest("hex").toUpperCase(), file.Hash);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const [width, height] of [[390, 844], [360, 740], [320, 700], [1440, 1000]]) {
    await page.setViewportSize({ width, height });
    const response = await page.goto("http://localhost:3000/campaign/business-growth", { waitUntil: "domcontentloaded", timeout: 60000 });
    assert.equal(response.status(), 200);
    await page.getByRole("heading", { level: 1, name: /Get your business/ }).waitFor();
    const offer = page.getByRole("region", { name: "Starter offer" });
    assert.deepEqual(await offer.locator("del").allTextContents(), ["₹10,000", "₹4,000"]);
    assert.ok((await offer.innerText()).includes("699"));
    await offer.getByText("DESIGN PREVIEW", { exact: true }).waitFor();
    await offer.getByText("Countdown preview", { exact: true }).waitFor();
    const cta = offer.getByRole("link", { name: "Enquire about this offer" });
    assert.match(decodeURIComponent(await cta.getAttribute("href")), /sample starter offer/);
    assert.equal(await page.locator("body").evaluate(el => el.scrollWidth > innerWidth), false, `Overflow at ${width}`);
    if (width < 720) {
      const button = await cta.boundingBox();
      const sticky = await page.locator("main > div").last().boundingBox();
      assert.ok(button.y + button.height <= sticky.y, `Offer contact below fold: ${width}, ${button.y + button.height} > ${sticky.y}`);
    }
    await page.screenshot({ path: `backup/public-offer-20261008-003450/offer-${width}.png` });
  }
  await page.getByRole("button", { name: "ERP software", exact: true }).click();
  assert.match(await page.locator("article").innerText(), /3G-Digital/);
  assert.equal(await page.locator("article").getByRole("link", { name: "Live website" }).count(), 0);
  await page.getByRole("button", { name: "College website", exact: true }).click();
  await page.getByRole("heading", { name: "Shri Lakshami Narayan Ayurvedic College" }).waitFor();
  assert.match(await page.locator('meta[name="robots"]').getAttribute("content"), /noindex/);
  assert.deepEqual(errors, []);
  console.log("PASS: offer hierarchy, preview labels, first-screen CTA, 320/360/390/1440 layouts, public access, project switching and unchanged saved homepage.");
} finally { await browser.close(); }
