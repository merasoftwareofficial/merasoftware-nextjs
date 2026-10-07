/**
 * Builds every Mera Software logo and icon file from one place: `npm run brand`.
 *
 * Input:  scripts/brand/design.json — the approved artwork (shapes, wordmark
 *         outlines, colours, measured edges). Never edited by hand.
 * Rules:  BRAND below — the owner's proportion choices. Change them here only.
 * Output: public/brand/merasoftware-logo.svg       logo for light backgrounds
 *         public/brand/merasoftware-logo-dark.svg  logo for navy/dark backgrounds
 *         public/brand/merasoftware-icon.svg       the "M" on a navy tile
 *         public/icons/{icon-192,icon-512,apple-touch-icon,badge-96}.png
 *         src/app/favicon.ico
 *         src/lib/brand-logo.json                  size + version, read by src/lib/brand.ts
 *
 * Every coordinate is written out directly (no transforms), so a file always
 * shows exactly what these rules say. Rendering uses sharp, which ships with Next.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/** Owner choices (7 Oct 2026). */
const BRAND = {
  /** The "M" is this many times as wide as it is tall (the reference artwork is ~2.3). */
  markRatio: 1.8,
  /** "Digital Solutions" relative to the reference artwork. */
  taglineScale: 1.15,
  /** Minimum space between "MERA SOFTWARE" and "Digital Solutions", in artwork units. */
  taglineGap: 20,
  /** Space kept below the lowest letter ("g") inside the file. */
  bottomPadding: 5,
  /** The "M" covers this share of the app-icon tile width; the favicon is cropped tighter. */
  iconFill: 0.79,
  faviconFill: 0.94,
  tileColour: "#00243d",
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const design = JSON.parse(readFileSync(join(ROOT, "scripts/brand/design.json"), "utf8"));
const m = design.metrics;
const [vbX, vbY, vbW] = design.viewBox;

const round = n => Math.round(n * 10) / 10;
const fmt = n => String(round(n));

// ── Geometry ────────────────────────────────────────────────────────────────

const markXs = design.mark.flatMap(shape => shape.points.map(([x]) => x));
const markYs = design.mark.flatMap(shape => shape.points.map(([, y]) => y));
const mark = { left: Math.min(...markXs), right: Math.max(...markXs), top: Math.min(...markYs), bottom: Math.max(...markYs) };
const markHeight = mark.bottom - mark.top;
const markWidth = Math.round(markHeight * BRAND.markRatio);
const k = markWidth / (mark.right - mark.left);

/** Narrows the "M" from its left edge. */
const markX = x => mark.left + (x - mark.left) * k;

/** x of the M's right band at height y, before narrowing. */
const [[bandX0, bandY0], [bandX1, bandY1]] = m.rightBand;
const bandX = y => bandX0 + ((bandX1 - bandX0) * (y - bandY0)) / (bandY1 - bandY0);

/** The wordmark moves left with the M so its gap to the right band (at the MERA baseline) stays as approved. */
const textShift = markX(bandX(m.meraBaseline)) - bandX(m.meraBaseline);

/** Tagline: scaled from its left baseline point, then lowered just enough to keep the gap. */
const s = BRAND.taglineScale;
const taglineTop = m.taglineBaseline - (m.taglineBaseline - m.taglineInkTop) * s;
const taglineDrop = Math.max(0, m.meraInkBottom + BRAND.taglineGap - taglineTop);
const taglineX = x => m.taglineInkLeft + (x - m.taglineInkLeft) * s + textShift;
const taglineY = y => m.taglineBaseline + taglineDrop + (y - m.taglineBaseline) * s;

const lowestInk = taglineY(m.taglineInkBottom);
const viewBox = [vbX, vbY, Math.round(vbW + textShift), Math.round(lowestInk + BRAND.bottomPadding - vbY)];

/** Applies per-axis functions to an absolute path made of M/L/H/V/Q/Z commands. */
function mapPath(d, fx, fy) {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let out = "";
  let command = "";
  let axis = 0;
  for (const token of tokens) {
    if (/[A-Za-z]/.test(token)) {
      if (!"MLHVQZ".includes(token)) throw new Error(`Unexpected path command ${token}`);
      command = token;
      axis = 0;
      out += token;
      continue;
    }
    const value = Number(token);
    const mapped = command === "H" ? fx(value) : command === "V" ? fy(value) : axis % 2 === 0 ? fx(value) : fy(value);
    axis += 1;
    out += (out.endsWith(" ") || /[A-Za-z]$/.test(out) ? "" : " ") + fmt(mapped);
  }
  return out;
}

const same = v => v;
const words = {
  mera: mapPath(design.words.mera, x => x + textShift, same),
  software: mapPath(design.words.software, x => x + textShift, same),
  digital: mapPath(design.words.digital, taglineX, taglineY),
  solutions: mapPath(design.words.solutions, taglineX, taglineY),
};

const markShapes = design.mark.map(shape => ({
  gradient: shape.gradient,
  points: shape.points.map(([x, y]) => `${fmt(markX(x))},${fmt(y)}`).join(" "),
}));

function gradients(palette, idPrefix = "") {
  return Object.entries(design.gradientLines)
    .map(([id, [x1, y1, x2, y2]]) => {
      const stops = palette.stops[id].map(([offset, colour]) => `<stop offset="${offset}" stop-color="${colour}"/>`).join("");
      return `    <linearGradient id="${idPrefix}${id}" gradientUnits="userSpaceOnUse" x1="${fmt(markX(x1))}" y1="${y1}" x2="${fmt(markX(x2))}" y2="${y2}">${stops}</linearGradient>`;
    })
    .join("\n");
}

const markMarkup = (fill = id => `url(#${id})`) =>
  markShapes.map(shape => `  <polygon points="${shape.points}" fill="${fill(shape.gradient)}"/>`).join("\n");

// ── Files ───────────────────────────────────────────────────────────────────

const HEADER = "<!-- Generated by scripts/brand/build.mjs (npm run brand). Do not edit; change BRAND in that script instead. -->";

function logoSvg(paletteName) {
  const palette = design.palettes[paletteName];
  return `${HEADER}
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(" ")}" role="img" aria-label="Mera Software — Digital Solutions">
  <title>Mera Software — Digital Solutions</title>
  <defs>
${gradients(palette)}
  </defs>
${markMarkup()}
  <path fill="${palette.mera}" d="${words.mera}"/>
  <path fill="${palette.software}" d="${words.software}"/>
  <path fill="${palette.tagline}" d="${words.digital}"/>
  <path fill="${palette.tagline}" d="${words.solutions}"/>
</svg>
`;
}

/** A square around the narrowed "M"; `fill` is the share of the tile the M spans. */
function tile(fill) {
  const side = Math.round(markWidth / fill);
  const cx = mark.left + markWidth / 2;
  const cy = (mark.top + mark.bottom) / 2;
  return { x: round(cx - side / 2), y: round(cy - side / 2), side };
}

function iconSvg({ fill, radius = 0 }) {
  const t = tile(fill);
  return `${HEADER}
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${t.x} ${t.y} ${t.side} ${t.side}">
  <defs>
${gradients(design.palettes.dark)}
  </defs>
  <rect x="${t.x}" y="${t.y}" width="${t.side}" height="${t.side}"${radius ? ` rx="${Math.round(t.side * radius)}"` : ""} fill="${BRAND.tileColour}"/>
${markMarkup()}
</svg>
`;
}

/** Android notification badge: only the alpha channel is used, so the M is one white silhouette (the pale triangle stays cut out). */
function badgeSvg() {
  const t = tile(BRAND.iconFill);
  const cutOut = design.mark.findIndex(shape => shape.gradient === "p");
  const shapes = markShapes.map((shape, i) => `<polygon points="${shape.points}" fill="${i === cutOut ? "#000" : "#fff"}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${t.x} ${t.y} ${t.side} ${t.side}">
  <defs><mask id="m">${shapes}</mask></defs>
  <rect x="${t.x}" y="${t.y}" width="${t.side}" height="${t.side}" fill="#fff" mask="url(#m)"/>
</svg>
`;
}

const png = (svg, size) => sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toBuffer();

/** An .ico holding PNG images (supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const at = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, at);
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(image => image.data)]);
}

const write = (path, data) => {
  writeFileSync(join(ROOT, path), data);
  console.log(`  ${path}`);
};

const logoLight = logoSvg("light");
const logoDark = logoSvg("dark");
const icon = iconSvg({ fill: BRAND.iconFill });
const favicon = iconSvg({ fill: BRAND.faviconFill, radius: 0.114 });

console.log(`M ${markWidth}×${markHeight} (ratio ${BRAND.markRatio}), logo viewBox ${viewBox.join(" ")}`);
write("public/brand/merasoftware-logo.svg", logoLight);
write("public/brand/merasoftware-logo-dark.svg", logoDark);
write("public/brand/merasoftware-icon.svg", icon);
write("public/icons/icon-192.png", await png(icon, 192));
write("public/icons/icon-512.png", await png(icon, 512));
write("public/icons/apple-touch-icon.png", await png(icon, 180));
write("public/icons/badge-96.png", await png(badgeSvg(), 96));
write("src/app/favicon.ico", ico(await Promise.all([16, 32, 48, 256].map(async size => ({ size, data: await png(favicon, size) })))));

// The version changes whenever the artwork does, so browsers fetch the new files (src/lib/brand.ts).
const version = createHash("sha1").update(logoLight + logoDark + icon).digest("hex").slice(0, 8);
write("src/lib/brand-logo.json", `${JSON.stringify({ width: viewBox[2], height: viewBox[3], version }, null, 2)}\n`);
