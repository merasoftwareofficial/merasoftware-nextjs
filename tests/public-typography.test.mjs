import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const GLOBALS_CSS = path.resolve("src/app/globals.css");
const PORTFOLIO_CSS = path.resolve("src/app/portfolio.css");
const HOMEPAGE_CTAS_CSS = path.resolve("src/components/campaign/homepage-ctas.module.css");
const SERVICES_CSS = path.resolve("src/app/services/services.module.css");

const REQUIRED_TOKENS = [
  "--pub-tag",
  "--pub-hint",
  "--pub-ui",
  "--pub-body",
  "--pub-lead",
  "--pub-card-title",
  "--pub-cta-title",
  "--pub-h2-sm",
  "--pub-h2",
  "--pub-h1",
];

function extractPxValues(value) {
  return [...value.matchAll(/([0-9.]+)px/g)].map(m => Number(m[1]));
}

test("public typography SSOT defines all --pub-* tokens once in globals.css with a >= 13px floor", () => {
  const globals = fs.readFileSync(GLOBALS_CSS, "utf8");
  const decls = new Map();

  for (const match of globals.matchAll(/(--pub-[a-z0-9-]+)\s*:\s*([^;}]+)/g)) {
    const [, name, rawValue] = match;
    const value = rawValue.trim();
    assert.equal(decls.has(name), false, `Duplicate SSOT token declaration for ${name} in globals.css`);
    decls.set(name, value);
  }

  for (const token of REQUIRED_TOKENS) {
    assert.ok(decls.has(token), `Missing required Public Typography SSOT token: ${token}`);
    const pxValues = extractPxValues(decls.get(token));
    assert.ok(pxValues.length > 0, `Token ${token} must contain an explicit px floor`);
    for (const px of pxValues) {
      assert.ok(px >= 13, `Public Typography SSOT token ${token} has sub-13px value: ${px}px`);
    }
  }
});

test("Phase 1 public stylesheets use --pub-* SSOT tokens with zero hardcoded px font sizes", () => {
  const globals = fs.readFileSync(GLOBALS_CSS, "utf8");
  const marker = "PHASE 1 MODERN UI";
  const markerIndex = globals.indexOf(marker);
  assert.ok(markerIndex !== -1, "Missing PHASE 1 MODERN UI section in globals.css");
  const phase1Globals = globals.slice(markerIndex);

  const portfolioCardCss = fs.readFileSync(PORTFOLIO_CSS, "utf8").split(/\r?\n/).slice(0, 11).join("\n");
  const homepageCtasCss = fs.readFileSync(HOMEPAGE_CTAS_CSS, "utf8");
  const servicesCss = fs.readFileSync(SERVICES_CSS, "utf8");

  const targets = [
    ["src/app/globals.css (Phase 1 block)", phase1Globals],
    ["src/app/portfolio.css (card rules)", portfolioCardCss],
    ["src/components/campaign/homepage-ctas.module.css", homepageCtasCss],
    ["src/app/services/services.module.css", servicesCss],
  ];

  const violations = [];
  for (const [label, css] of targets) {
    for (const match of css.matchAll(/font-size\s*:\s*([^;}]+)/g)) {
      const value = match[1].trim();
      const allowed = /^var\(--pub-[a-z0-9-]+\)$/.test(value) || /^(?:\d+\.?\d*|\.\d+)em$/.test(value) || value === "inherit";
      if (!allowed) violations.push(`${label}: font-size: ${value}`);
    }
  }

  assert.deepEqual(violations, [], `Found non-SSOT hardcoded font-size values:\n${violations.join("\n")}`);
});
