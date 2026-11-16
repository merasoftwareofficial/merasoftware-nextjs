import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ADMIN_DIR = path.resolve("src/app/admin");
const GLOBALS_CSS = path.resolve("src/app/globals.css");

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.(css|tsx|ts)$/.test(entry.name)) files.push(full);
  }
  return files;
}

test("admin panel has no hardcoded font sizes below 13px and defines SSOT tokens in globals.css", () => {
  const globals = fs.readFileSync(GLOBALS_CSS, "utf8");
  assert.match(globals, /\.admin-shell\{[^}]*--fs-tag:13px;--fs-label:13px;--fs-meta:14px;--fs-ui:15px/);

  const violations = [];
  const patterns = [
    /font-size\s*:\s*(?:[0-9]|1[0-2])px/g,
    /fontSize\s*:\s*(?:[0-9]|1[0-2])\b/g,
    /text-\[(?:[0-9]|1[0-2])px\]/g,
    /\btext-xs\b/g,
  ];
  for (const file of walk(ADMIN_DIR)) {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, idx) => {
      for (const rx of patterns) {
        rx.lastIndex = 0;
        if (rx.test(line)) {
          violations.push(`${path.relative(process.cwd(), file)}:${idx + 1}: ${line.trim()}`);
        }
      }
    });
  }
  assert.deepEqual(violations, [], `Found sub-13px font sizes in admin:\n${violations.join("\n")}`);
});
