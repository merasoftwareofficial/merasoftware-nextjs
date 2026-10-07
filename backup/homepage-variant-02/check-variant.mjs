import { build } from "esbuild";
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const bundle = await build({
  stdin: { contents: 'import React from "react"; import {createRoot} from "react-dom/client"; import {DigitalPresenceVariant} from "./src/components/homepage-variants/digital-presence/variant"; createRoot(document.getElementById("root")).render(React.createElement(DigitalPresenceVariant));', resolveDir: root, loader: "tsx" },
  bundle: true, write: false, outfile: "variant-check.js", platform: "browser", jsx: "automatic", loader: { ".css": "local-css" },
});
const js = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
const css = bundle.outputFiles.find(file => file.path.endsWith(".css")).text;
const brand = readFileSync("src/app/brand-colors.css", "utf8");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("http://variant.test/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: `<html lang="en"><head><style>*{box-sizing:border-box}body{margin:0}h1,h2,h3,p,figure,ul{margin:0}a{color:inherit;text-decoration:none}button{font:inherit}${brand}${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>` });
    const asset = path.join(root, "public", url.pathname);
    return existsSync(asset) ? route.fulfill({ contentType: "image/svg+xml", body: readFileSync(asset) }) : route.fulfill({ status: 404, body: "Not found" });
  });
  await page.goto("http://variant.test/");
  await page.getByRole("heading", { name: /Your business/, level: 1 }).waitFor();
  assert.doesNotMatch(await page.locator("main").innerText(), /\b(aap|karein|samjhenge|sambhaliye|honge|zaruratein)\b/i);
  assert.match(decodeURIComponent(await page.getByRole("link", { name: /Email our team/ }).first().getAttribute("href")), /Hello, I would like to discuss/);
  assert.equal(await page.locator('#work article').count(), 3);
  await page.getByRole('link', {name: 'See our work', exact: true}).click();
  assert.equal(new URL(page.url()).hash, '#work');
  for (const link of await page.locator('#work a[target="_blank"]').all()) assert.match(await link.getAttribute('rel'), /noreferrer/);
  await page.locator('#work img').evaluateAll(images => images.forEach(image => { image.loading = 'eager'; }));
  await page.waitForFunction(() => [...document.querySelectorAll('#work img')].every(image => image.complete && image.naturalWidth > 0));
  for (const width of [360, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    assert.equal(await page.locator("body").evaluate(el => el.scrollWidth > innerWidth), false, `Overflow at ${width}px`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `backup/homepage-variant-02/trust-${width}.png`, fullPage: width !== 1440 });
  }
  await page.locator("summary").filter({ hasText: "Not sure which service you need?" }).click();
  await page.getByText("Start with your business goals. We will explain the suitable services, scope and cost.", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS: English copy, mobile/desktop layout, FAQ, enquiries and runtime errors.");
  await page.unroute("http://variant.test/**");
  for (const route of (process.env.VARIANT_VISUAL_ONLY ? [] : ["/admin/homepage-variants", "/preview/homepage-variants/digital-presence"])) {
    await page.goto(`http://localhost:3000${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    assert.ok(new URL(page.url()).pathname === "/login", `Anonymous access allowed: ${route}`);
    assert.equal(new URL(page.url()).searchParams.get("next"), route);
  }
  if (!process.env.VARIANT_VISUAL_ONLY) console.log("PASS: admin and full-preview login guards.");
} finally { await browser.close(); }
