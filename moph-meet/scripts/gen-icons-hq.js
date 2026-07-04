// One-off HIGH-QUALITY icon generator (icon-quality fix).
//
// Root cause of the previous blocky/pixelated icons: icon.png was upscaled
// 512 -> 1024 with NEAREST-NEIGHBOUR, producing hard stair-stepped edges, and
// the launcher/adaptive/store icons were re-derived from that already-degraded
// 1024. This script goes back to the PRISTINE 512x512 source (extracted from
// git commit b8f818e, before task 9.1 touched icon.png) and produces every
// output from that single high-quality source using premultiplied-alpha
// BILINEAR scaling (reused from gen-adaptive-icon.js) — never nearest-neighbour.
//
// Outputs (all from the pristine 512 source):
//   1. store-assets/play-store-icon-512.png  512x512, OPAQUE WHITE bg, logo
//      content bbox fit to ~80% width, centered. Native 512-from-512 = sharpest.
//   2. assets/images/icon.png                1024x1024, full logo, bilinear 2x
//      upscale (smooth, not blocky). >=1024 + square for the build gate.
//   3. assets/images/adaptive-icon.png       1024x1024, transparent, logo
//      centered, bbox DIAGONAL <= 0.62*1024 (circular safe zone), bilinear.
//
// SCOPE (Req 10): only writes inside moph-meet/ (assets/images/, store-assets/).
// Reads the pristine source read-only; does NOT touch core/ or *-lite/.

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');

// The pristine 512x512 source is passed as argv[2] (extracted from git).
const SRC = process.argv[2];
if (!SRC) {
  console.error('Usage: node gen-icons-hq.js <path-to-pristine-512-source.png>');
  process.exit(1);
}

const OUT_STORE_DIR = path.join(ROOT, 'store-assets');
const OUT_STORE = path.join(OUT_STORE_DIR, 'play-store-icon-512.png');
const OUT_ICON = path.join(ROOT, 'assets', 'images', 'icon.png');
const OUT_ADAPTIVE = path.join(ROOT, 'assets', 'images', 'adaptive-icon.png');

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

// Measure the non-transparent content bounding box (alpha > 0).
function measureBBox(png) {
  const { width, height, data } = png;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('Source logo is fully transparent.');
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// Premultiplied-alpha BILINEAR scale of a cropped region -> (dstW x dstH) RGBA.
// (Reused verbatim in behaviour from scripts/gen-adaptive-icon.js.)
function scaleRegion(png, bbox, dstW, dstH) {
  const { width, data } = png;
  const out = Buffer.alloc(dstW * dstH * 4);

  for (let dy = 0; dy < dstH; dy += 1) {
    const sy = ((dy + 0.5) * bbox.h) / dstH - 0.5 + bbox.y;
    const y0 = Math.floor(sy);
    const y1 = Math.min(y0 + 1, bbox.y + bbox.h - 1);
    const fy = sy - y0;
    const yy0 = Math.max(y0, bbox.y);

    for (let dx = 0; dx < dstW; dx += 1) {
      const sx = ((dx + 0.5) * bbox.w) / dstW - 0.5 + bbox.x;
      const x0 = Math.floor(sx);
      const x1 = Math.min(x0 + 1, bbox.x + bbox.w - 1);
      const fx = sx - x0;
      const xx0 = Math.max(x0, bbox.x);

      const samples = [
        { x: xx0, y: yy0, w: (1 - fx) * (1 - fy) },
        { x: x1, y: yy0, w: fx * (1 - fy) },
        { x: xx0, y: y1, w: (1 - fx) * fy },
        { x: x1, y: y1, w: fx * fy },
      ];

      let pr = 0;
      let pg = 0;
      let pb = 0;
      let pa = 0;
      for (const s of samples) {
        const idx = (s.y * width + s.x) * 4;
        const a = data[idx + 3];
        const af = a / 255;
        pr += data[idx] * af * s.w;
        pg += data[idx + 1] * af * s.w;
        pb += data[idx + 2] * af * s.w;
        pa += a * s.w;
      }

      const oidx = (dy * dstW + dx) * 4;
      if (pa > 0) {
        const af = pa / 255;
        out[oidx] = Math.round(Math.min(255, pr / af));
        out[oidx + 1] = Math.round(Math.min(255, pg / af));
        out[oidx + 2] = Math.round(Math.min(255, pb / af));
        out[oidx + 3] = Math.round(Math.min(255, pa));
      } else {
        out[oidx] = 0;
        out[oidx + 1] = 0;
        out[oidx + 2] = 0;
        out[oidx + 3] = 0;
      }
    }
  }
  return out;
}

// Composite a scaled RGBA buffer centered onto a destination PNG (over its
// existing pixels using source-over alpha blending).
function compositeCentered(dstPng, scaled, dstW, dstH, canvas) {
  const offX = Math.round((canvas - dstW) / 2);
  const offY = Math.round((canvas - dstH) / 2);
  for (let y = 0; y < dstH; y += 1) {
    for (let x = 0; x < dstW; x += 1) {
      const sidx = (y * dstW + x) * 4;
      const didx = ((offY + y) * canvas + (offX + x)) * 4;
      const sa = scaled[sidx + 3] / 255;
      if (sa <= 0) continue;
      const da = dstPng.data[didx + 3] / 255;
      const outA = sa + da * (1 - sa);
      for (let c = 0; c < 3; c += 1) {
        const sc = scaled[sidx + c];
        const dc = dstPng.data[didx + c];
        dstPng.data[didx + c] = Math.round((sc * sa + dc * da * (1 - sa)) / outA);
      }
      dstPng.data[didx + 3] = Math.round(outA * 255);
    }
  }
  return { offX, offY };
}

function main() {
  const src = readPng(SRC);
  console.log('=== HIGH-QUALITY icon regeneration (pristine 512 source) ===');
  console.log(`source: ${SRC} (${src.width}x${src.height})`);
  if (src.width !== 512 || src.height !== 512) {
    console.warn(`WARN: expected 512x512 pristine source, got ${src.width}x${src.height}.`);
  }
  const bbox = measureBBox(src);
  const diag = Math.sqrt(bbox.w * bbox.w + bbox.h * bbox.h);
  console.log(`content bbox: x=${bbox.x} y=${bbox.y} w=${bbox.w} h=${bbox.h} (diag=${diag.toFixed(1)})`);

  // ---- Output 1: Play Store listing icon (512, opaque white) ----
  {
    const CANVAS = 512;
    const TARGET_FRAC = 0.62; // ~62% of width, more padding like typical store icons
    const scale = (TARGET_FRAC * CANVAS) / Math.max(bbox.w, bbox.h);
    const dstW = Math.max(1, Math.round(bbox.w * scale));
    const dstH = Math.max(1, Math.round(bbox.h * scale));
    const scaled = scaleRegion(src, bbox, dstW, dstH);

    const png = new PNG({ width: CANVAS, height: CANVAS });
    // Fill OPAQUE WHITE (#ffffff, alpha 255) — Play requires a filled icon.
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i] = 255;
      png.data[i + 1] = 255;
      png.data[i + 2] = 255;
      png.data[i + 3] = 255;
    }
    const { offX, offY } = compositeCentered(png, scaled, dstW, dstH, CANVAS);
    fs.mkdirSync(OUT_STORE_DIR, { recursive: true });
    fs.writeFileSync(OUT_STORE, PNG.sync.write(png));
    console.log('\n[1] play-store-icon-512.png');
    console.log(`    canvas ${CANVAS}x${CANVAS} OPAQUE WHITE #ffffff`);
    console.log(`    scale=${scale.toFixed(4)} (bbox max ${Math.max(bbox.w, bbox.h)} -> ${(TARGET_FRAC * CANVAS).toFixed(1)}px = ${(TARGET_FRAC * 100).toFixed(0)}% width)`);
    console.log(`    logo ${dstW}x${dstH} at offset (${offX},${offY})`);
    console.log(`    wrote: ${OUT_STORE}`);
  }

  // ---- Output 2: icon.png (1024, full logo, bilinear upscale) ----
  {
    const CANVAS = 1024;
    // Scale the FULL source image (bbox = whole 512 canvas) 512 -> 1024.
    const fullBox = { x: 0, y: 0, w: src.width, h: src.height };
    const scaled = scaleRegion(src, fullBox, CANVAS, CANVAS);
    const png = new PNG({ width: CANVAS, height: CANVAS });
    png.data.set(scaled);
    fs.writeFileSync(OUT_ICON, PNG.sync.write(png));
    console.log('\n[2] icon.png');
    console.log(`    canvas ${CANVAS}x${CANVAS} full logo (transparent preserved)`);
    console.log(`    bilinear upscale ${src.width}x${src.height} -> ${CANVAS}x${CANVAS} (scale=${(CANVAS / src.width).toFixed(4)})`);
    console.log(`    wrote: ${OUT_ICON}`);
  }

  // ---- Output 3: adaptive-icon.png (1024, transparent, launcher foreground) ----
  {
    const CANVAS = 1024;
    // Smaller logo with more padding (Play Store style). Target the content
    // bbox MAX dimension = 0.38 * 1024 (~389px). Diagonal stays well within
    // the circular safe zone (0.62*1024 = 635px).
    const TARGET_FRAC = 0.38;
    const SAFE_FRACTION = 0.62;
    const scale = (TARGET_FRAC * CANVAS) / Math.max(bbox.w, bbox.h);
    // Floor (not round) so the integer pixel size can never exceed the target
    // due to rounding-up (keeps the no-clip / padding guarantee).
    const dstW = Math.max(1, Math.floor(bbox.w * scale));
    const dstH = Math.max(1, Math.floor(bbox.h * scale));
    const scaledDiag = Math.sqrt(dstW * dstW + dstH * dstH);
    const scaled = scaleRegion(src, bbox, dstW, dstH);
    const png = new PNG({ width: CANVAS, height: CANVAS });
    png.data.fill(0); // transparent
    const { offX, offY } = compositeCentered(png, scaled, dstW, dstH, CANVAS);
    fs.writeFileSync(OUT_ADAPTIVE, PNG.sync.write(png));
    console.log('\n[3] adaptive-icon.png');
    console.log(`    canvas ${CANVAS}x${CANVAS} transparent`);
    console.log(`    scale=${scale.toFixed(4)} (bbox max ${Math.max(bbox.w, bbox.h)} -> ${(TARGET_FRAC * CANVAS).toFixed(1)}px = ${(TARGET_FRAC * 100).toFixed(0)}% width)`);
    console.log(`    logo ${dstW}x${dstH} at offset (${offX},${offY}), diag=${scaledDiag.toFixed(1)}`);
    console.log(`    FITS 0.62 circle (${(SAFE_FRACTION * CANVAS).toFixed(1)}px)? ${scaledDiag <= SAFE_FRACTION * CANVAS ? 'YES' : 'NO'}`);
    console.log(`    wrote: ${OUT_ADAPTIVE}`);
  }
}

main();
