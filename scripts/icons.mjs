// Generates every app icon from the arched-mirror mark. Run: npm run icons
import { mkdirSync, unlinkSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const ESPRESSO = "#2b1e17";
const BUTTER = "#f2c14e";

// Tab-size mark: a bigger arch and no highlight, so it stays crisp at 16px.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${ESPRESSO}"/>
  <path d="M120 440V232a136 136 0 0 1 272 0v208z" fill="${BUTTER}"/>
</svg>
`;

// Home-screen mark with the mirror highlight. `rounded` for browsers/Android, square for iOS.
const appIcon = (rounded, scale = 1) => {
  const t = `translate(256 256) scale(${scale}) translate(-256 -256)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ""} fill="${ESPRESSO}"/>
  <g transform="${t}">
    <path d="M146 430V236a110 110 0 0 1 220 0v194z" fill="${BUTTER}"/>
    <path d="M200 236a56 56 0 0 1 56-56" fill="none" stroke="#fff" stroke-width="20" stroke-linecap="round" opacity=".7"/>
  </g>
</svg>
`;
};

const png = (svg, size) => sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toBuffer();

/** An .ico holding PNG images (supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

async function main() {
  mkdirSync("public/icons", { recursive: true });

  // app/ file conventions: Next adds the <link> tags automatically.
  writeFileSync("src/app/icon.svg", favicon);
  const tabSizes = [];
  for (const size of [16, 32, 48]) tabSizes.push({ size, data: await png(favicon, size) });
  writeFileSync("src/app/favicon.ico", ico(tabSizes));
  writeFileSync("src/app/apple-icon.png", await png(appIcon(false), 180));

  // Web app manifest icons.
  writeFileSync("public/icons/icon-192.png", await png(appIcon(true), 192));
  writeFileSync("public/icons/icon-512.png", await png(appIcon(true), 512));
  // Maskable: full bleed, mark shrunk into the central safe zone (Android crops to any shape).
  writeFileSync("public/icons/icon-maskable-512.png", await png(appIcon(false, 0.82), 512));

  // Superseded by src/app/icon.svg (both would be served at /icon.svg).
  if (existsSync("public/icon.svg")) unlinkSync("public/icon.svg");

  console.log("Icons written.");
}

main();
