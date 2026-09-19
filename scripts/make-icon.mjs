#!/usr/bin/env node
/**
 * Generates the application icon (build/icon.ico + build/icon.png).
 *
 * Everything is rasterised in-process — a small supersampled painter plus a
 * hand-rolled PNG encoder (Node's zlib only) — so regenerating the icon needs no
 * graphics libraries and no Electron runtime.
 *
 * The artwork uses the same palette as src/style.css: the dark card gradient and
 * the #1db954 accent, with the beamed note matching the "🎵" brand mark.
 *
 *   node scripts/make-icon.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "build");

// Sizes Windows actually picks from an .ico: shell tiles, taskbar, alt-tab, large.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const SUPERSAMPLE = 4; // 4x4 samples per pixel gives clean edges at 16px

// ── Palette (mirrors the CSS custom properties) ──────────────────────────────
const BG_TOP = [0x1c, 0x23, 0x33]; // --bg-hover
const BG_BOTTOM = [0x0d, 0x11, 0x17]; // --bg
const NOTES_TOP = [0x1e, 0xd7, 0x60]; // --accent-hover
const NOTES_BOTTOM = [0x1d, 0xb9, 0x54]; // --accent
const BORDER = [0x30, 0x36, 0x3d]; // --border

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const gradient = (from, to) => (x, y) => mix(from, to, Math.min(Math.max(y / 256, 0), 1));

// ── Shape predicates, all expressed in a 256x256 design space ────────────────
function roundedRect(cx, cy, hw, hh, r) {
  return (x, y) => {
    const dx = Math.abs(x - cx) - (hw - r);
    const dy = Math.abs(y - cy) - (hh - r);
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - r <= 0;
  };
}

function rotatedEllipse(cx, cy, rx, ry, degrees) {
  const a = (-degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const ux = dx * cos - dy * sin;
    const uy = dx * sin + dy * cos;
    return (ux * ux) / (rx * rx) + (uy * uy) / (ry * ry) <= 1;
  };
}

function polygon(points) {
  return (x, y) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  };
}

const not = (shape) => (x, y) => !shape(x, y);

// ── The artwork: painted back to front, later shapes overwrite earlier ones ──
const bgOuter = roundedRect(128, 128, 128, 128, 56);
const borderOuter = roundedRect(128, 128, 124, 124, 53);
const borderInner = roundedRect(128, 128, 122, 122, 51);

const SHAPES = [
  { inside: bgOuter, color: gradient(BG_TOP, BG_BOTTOM) },
  {
    inside: (x, y) => borderOuter(x, y) && not(borderInner)(x, y),
    color: () => BORDER,
  },
  // Beamed eighth notes: two stems, a connecting beam, two note heads.
  { inside: roundedRect(111, 128, 7, 49, 4), color: gradient(NOTES_TOP, NOTES_BOTTOM) },
  { inside: roundedRect(195, 105, 7, 50, 4), color: gradient(NOTES_TOP, NOTES_BOTTOM) },
  {
    inside: polygon([
      [104, 79],
      [202, 55],
      [202, 81],
      [104, 105],
    ]),
    color: gradient(NOTES_TOP, NOTES_BOTTOM),
  },
  { inside: rotatedEllipse(86, 177, 32, 24, -18), color: gradient(NOTES_TOP, NOTES_BOTTOM) },
  { inside: rotatedEllipse(170, 155, 32, 24, -18), color: gradient(NOTES_TOP, NOTES_BOTTOM) },
];

/** Renders the artwork to an RGBA buffer at exactly `size` x `size` pixels. */
function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const scale = 256 / size;
  const samples = SUPERSAMPLE * SUPERSAMPLE;
  const step = 1 / SUPERSAMPLE;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px + (sx + 0.5) * step) * scale;
          const y = (py + (sy + 0.5) * step) * scale;
          // Last matching shape wins; nothing matches outside the rounded square.
          let color = null;
          for (const shape of SHAPES) {
            if (shape.inside(x, y)) color = shape.color(x, y);
          }
          if (color) {
            r += color[0];
            g += color[1];
            b += color[2];
            hits++;
          }
        }
      }

      const offset = (py * size + px) * 4;
      if (hits > 0) {
        rgba[offset] = Math.round(r / hits);
        rgba[offset + 1] = Math.round(g / hits);
        rgba[offset + 2] = Math.round(b / hits);
        rgba[offset + 3] = Math.round((hits / samples) * 255); // edge coverage
      }
    }
  }
  return rgba;
}

// ── Minimal PNG encoder (truecolour + alpha, no filtering) ───────────────────
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // bytes 10-12 stay 0: deflate, adaptive filtering, no interlace

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── ICO container (PNG-compressed entries, supported since Windows Vista) ────
function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const directory = [];
  const blobs = [];
  let offset = 6 + entries.length * 16;

  for (const { size, png } of entries) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size; // 0 means 256
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0; // palette size
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    directory.push(entry);
    blobs.push(png);
    offset += png.length;
  }

  return Buffer.concat([header, ...directory, ...blobs]);
}

// ── Run ─────────────────────────────────────────────────────────────────────
mkdirSync(outDir, { recursive: true });

const entries = ICO_SIZES.map((size) => ({ size, png: encodePng(render(size), size) }));
const icoPath = path.join(outDir, "icon.ico");
writeFileSync(icoPath, encodeIco(entries));

const pngPath = path.join(outDir, "icon.png");
writeFileSync(pngPath, entries.find((e) => e.size === 256).png);

console.log(`Wrote ${path.relative(root, icoPath)} (${ICO_SIZES.join(", ")} px)`);
console.log(`Wrote ${path.relative(root, pngPath)} (256 px)`);
