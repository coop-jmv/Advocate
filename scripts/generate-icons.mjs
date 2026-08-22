// One-off icon generator: renders LexDiary's actual brand mark (the Scale
// glyph on the app's --primary navy, exactly as used in AppShell/SiteChrome/
// auth.tsx) into the site's favicon/app icons, replacing the generic "AC"
// placeholder that shipped in public/. Run with `node scripts/generate-icons.mjs`
// whenever the brand mark itself changes — not part of the regular build.
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

// Exact resolved sRGB values for --primary / --primary-foreground (light
// theme), read live from the deployed app via a canvas fillRect + getImageData
// round-trip rather than hand-converting the oklch() tokens.
const BG = "#0f1e42";
const FG = "#f3f7fc";

// The Scale icon's own path data (lucide-react, 24x24 viewBox, stroke-based),
// copied verbatim from node_modules/lucide-react/dist/esm/icons/scale.js so
// the favicon is the same mark used everywhere else in the app.
const SCALE_PATHS = [
  "M12 3v18",
  "m19 8 3 8a5 5 0 0 1-6 0zV7",
  "M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1",
  "m5 8 3 8a5 5 0 0 1-6 0zV7",
  "M7 21h10",
];

// glyphFraction: how much of the canvas width the 24x24 glyph box occupies.
function iconSvg({ size, cornerRatio, glyphFraction, transparentBg = false }) {
  const r = size * cornerRatio;
  const glyphSize = size * glyphFraction;
  const scale = glyphSize / 24;
  const offset = (size - glyphSize) / 2;
  const bgRect = transparentBg
    ? ""
    : `<rect width="${size}" height="${size}" rx="${r}" fill="${BG}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${bgRect}
    <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="${FG}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      ${SCALE_PATHS.map((d) => `<path d="${d}"/>`).join("\n      ")}
    </g>
  </svg>`;
}

async function renderPng(svg, size, outPath) {
  const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  writeFileSync(outPath, buf);
  return buf;
}

// Simple ICO container (PNG-in-ICO, supported by every modern browser) —
// avoids needing a raw-BMP encoder for a format this small.
function buildIco(entries) {
  const count = entries.length;
  const headerSize = 6 + 16 * count;
  let offset = headerSize;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  entries.forEach((entry, i) => {
    const base = 6 + i * 16;
    const dim = entry.size >= 256 ? 0 : entry.size; // 0 means 256
    header.writeUInt8(dim, base + 0); // width
    header.writeUInt8(dim, base + 1); // height
    header.writeUInt8(0, base + 2); // color palette
    header.writeUInt8(0, base + 3); // reserved
    header.writeUInt16LE(1, base + 4); // color planes
    header.writeUInt16LE(32, base + 6); // bits per pixel
    header.writeUInt32LE(entry.buf.length, base + 8); // image size
    header.writeUInt32LE(offset, base + 12); // image offset
    offset += entry.buf.length;
  });
  return Buffer.concat([header, ...entries.map((e) => e.buf)]);
}

async function main() {
  // Square app icons: full-bleed rounded background, standard padding
  // (glyph at ~60% of canvas width, matching the old "AC" placeholder's
  // proportions).
  await renderPng(
    iconSvg({ size: 192, cornerRatio: 0.22, glyphFraction: 0.6 }),
    192,
    join(publicDir, "icon-192.png"),
  );
  await renderPng(
    iconSvg({ size: 512, cornerRatio: 0.22, glyphFraction: 0.6 }),
    512,
    join(publicDir, "icon-512.png"),
  );
  // Maskable: OS may crop to a circle/squircle, so keep the glyph inside the
  // ~80% "safe zone" and let the background go full-bleed square with no
  // rounding of its own — the OS applies its own mask shape on top.
  await renderPng(
    iconSvg({ size: 512, cornerRatio: 0, glyphFraction: 0.42 }),
    512,
    join(publicDir, "icon-512-maskable.png"),
  );
  // Apple touch icon: iOS rounds the corners itself, so ship a square,
  // full-bleed background per Apple's own guidance.
  await renderPng(
    iconSvg({ size: 180, cornerRatio: 0, glyphFraction: 0.6 }),
    180,
    join(publicDir, "apple-touch-icon.png"),
  );

  // favicon.ico: 16/32/48, rendered at 4x then downscaled for clean edges,
  // slightly more corner rounding since it displays tiny in a browser tab.
  const icoSizes = [16, 32, 48];
  const icoEntries = [];
  for (const size of icoSizes) {
    const superSize = size * 4;
    const buf = await sharp(
      Buffer.from(iconSvg({ size: superSize, cornerRatio: 0.22, glyphFraction: 0.62 })),
    )
      .resize(size, size)
      .png()
      .toBuffer();
    icoEntries.push({ size, buf });
  }
  writeFileSync(join(publicDir, "favicon.ico"), buildIco(icoEntries));

  console.log(
    "Generated icon-192.png, icon-512.png, icon-512-maskable.png, apple-touch-icon.png, favicon.ico",
  );
}

await main();
