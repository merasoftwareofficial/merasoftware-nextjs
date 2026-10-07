import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://localhost:3000/campaign/business-growth", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: /Aap business sambhaliye/ }).waitFor();
  assert.equal(await page.getByRole("progressbar").count(), 0);
  assert.equal(await page.locator("body").evaluate(el => el.scrollWidth > innerWidth), false);
  assert.match(await page.locator('meta[name="robots"]').getAttribute("content"), /noindex/);
  assert.match(await page.getByRole("link", { name: "Message karein", exact: true }).first().getAttribute("href"), /^mailto:contact@merasoftware.com/);
  for (const text of ["₹2,500", "₹900", "₹6,000"]) assert.ok((await page.locator("main").innerText()).includes(text));
  await page.screenshot({ path: "backup/campaign-trust/mobile-full.png", fullPage: true });
  await page.screenshot({ path: "backup/campaign-trust/mobile-top.png" });
  await page.locator("summary").filter({ hasText: "Mujhe nahi pata kaunsa package chahiye." }).click();
  await page.getByText(/Koi baat nahi/).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://localhost:3000/campaign/business-growth", { waitUntil: "domcontentloaded" });
  assert.equal(await page.locator("body").evaluate(el => el.scrollWidth > innerWidth), false);
  await page.screenshot({ path: "backup/campaign-trust/desktop-top.png" });
  await page.screenshot({ path: "backup/campaign-trust/desktop-full.png", fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  assert.equal(await page.locator("body").evaluate(el => el.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log("PASS: mobile and desktop widths, quiz removed, enquiry, pricing, FAQ, noindex and browser errors.");
} finally { await browser.close(); }
