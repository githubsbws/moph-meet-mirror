// One-off generator for assets/images/adaptive-icon.png (URGENT circular-mask clip fix).
//
// Root cause of the clip: the previous fix scaled the logo to ~66% of the SQUARE
// canvas, but the logo bounding box is near-square, so its DIAGONAL exceeded the
// circular safe-zone diameter and the corners/edges (wordmark "H" + subtitle) got
// clipped by the adaptive circular mask.
//
// Fix: scale so the logo's content bounding box fits INSIDE the safe CIRCLE. A
// rectangle fits inside a circle iff its DIAGONAL <= circle diameter. Target
// diagonal <= 0.62 * 1024 (tighter than the 0.66 guaranteed safe zone), and also
// cap each scaled dimension <= 0.62 * 1024. Then composite CENTERED on a fully
// transparent 1024x1024 canvas (white bg comes from adaptiveIcon.backgroundColor).
//
// Pure-JS via pngjs (already in node_modules). Uses premultiplied-alpha bilinear
// downscaling to avoid a dark halo around the logo edges.
//
// SCOPE (Req 10): only writes assets/images/adaptive-icon.png. Reads icon.png
// read-only as the source.

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'images', 'icon.png');
const OUT = path.join(ROOT, 'assets', 'images', 'adaptive-icon.png');

const CANVAS = 1024;
const SAFE_FRACTION = 0.62; // tighter than the 0.66 guaranteed circular safe zone
const CIRCLE_66 = 0.66 * CANVAS; // ~676px reference circle diameter

function readPng(file) {
  const buf = fs.readFileSync(file);
  return PNG.sync.read(buf); // { width, height, data: RGBA Uint8 }
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
  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  };
}

// Premultiplied-alpha bilinear scale of a cropped region -> (dstW x dstH) RGBA.
function scaleRegion(png, bbox, dstW, dstH) {
  const { width, data } = png;
  const out = Buffer.alloc(dstW * dstH * 4);

  for (let dy = 0; dy < dstH; dy += 1) {
    // Map dest pixel center to source coords within the bbox.
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

      // Gather 4 neighbours, premultiplied.
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

function main() {
  const src = readPng(SRC);
  if (src.width !== CANVAS || src.height !== CANVAS) {
    console.warn(`WARN: source is ${src.width}x${src.height}, expected ${CANVAS}x${CANVAS}.`);
  }

  const bbox = measureBBox(src);
  const diag = Math.sqrt(bbox.w * bbox.w + bbox.h * bbox.h);

  // Scale so the content DIAGONAL fits the safe circle, and each dimension is capped.
  const sDiag = (SAFE_FRACTION * CANVAS) / diag;
  const sDim = (SAFE_FRACTION * CANVAS) / Math.max(bbox.w, bbox.h);
  const scale = Math.min(sDiag, sDim);

  const dstW = Math.max(1, Math.round(bbox.w * scale));
  const dstH = Math.max(1, Math.round(bbox.h * scale));
  const scaledDiag = Math.sqrt(dstW * dstW + dstH * dstH);

  const scaled = scaleRegion(src, bbox, dstW, dstH);

  // Composite centered on a fully transparent canvas.
  const outPng = new PNG({ width: CANVAS, height: CANVAS });
  outPng.data.fill(0); // transparent
  const offX = Math.round((CANVAS - dstW) / 2);
  const offY = Math.round((CANVAS - dstH) / 2);
  for (let y = 0; y < dstH; y += 1) {
    for (let x = 0; x < dstW; x += 1) {
      const sidx = (y * dstW + x) * 4;
      const didx = ((offY + y) * CANVAS + (offX + x)) * 4;
      outPng.data[didx] = scaled[sidx];
      outPng.data[didx + 1] = scaled[sidx + 1];
      outPng.data[didx + 2] = scaled[sidx + 2];
      outPng.data[didx + 3] = scaled[sidx + 3];
    }
  }

  fs.writeFileSync(OUT, PNG.sync.write(outPng));

  // Report the proof math.
  console.log('=== adaptive-icon.png regeneration ===');
  console.log(`source: ${SRC} (${src.width}x${src.height})`);
  console.log(`content bbox: x=${bbox.x} y=${bbox.y} w=${bbox.w} h=${bbox.h}`);
  console.log(`bbox diagonal (source px): ${diag.toFixed(1)}`);
  console.log(`scale factors: sDiag=${sDiag.toFixed(4)} sDim=${sDim.toFixed(4)} -> chosen=${scale.toFixed(4)}`);
  console.log(`final logo pixel size: ${dstW}x${dstH} (offset ${offX},${offY})`);
  console.log(`final logo diagonal: ${scaledDiag.toFixed(1)}px`);
  console.log(`safe circle @0.62: ${(SAFE_FRACTION * CANVAS).toFixed(1)}px | reference circle @0.66: ${CIRCLE_66.toFixed(1)}px`);
  console.log(
    `FITS 676 circle? diag ${scaledDiag.toFixed(1)} <= 676 -> ${scaledDiag <= CIRCLE_66 ? 'YES' : 'NO'}`,
  );
  console.log(`max scaled dim ${Math.max(dstW, dstH)} <= ${(SAFE_FRACTION * CANVAS).toFixed(1)} -> ${Math.max(dstW, dstH) <= SAFE_FRACTION * CANVAS ? 'YES' : 'NO'}`);
  console.log(`wrote: ${OUT}`);
}

main();
