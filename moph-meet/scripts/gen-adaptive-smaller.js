// One-off regeneration of ONLY assets/images/adaptive-icon.png with a SMALLER
// logo and more transparent padding (icon-too-big fix, iteration 3).
//
// Context: the launcher adaptive icon currently fills the circle (~45% of the
// 1024 canvas). The user wants it noticeably smaller — logo's LARGER dimension
// ≈ 36% of the 1024 canvas (~369px) — with generous transparent padding. The
// white background comes from app.json adaptiveIcon.backgroundColor=#ffffff.
//
// This reuses the SAME pristine 512 source (git b8f818e:moph-meet/assets/
// images/icon.png) and the SAME premultiplied-alpha BILINEAR scaling as
// scripts/gen-icons-hq.js. It deliberately writes ONLY adaptive-icon.png and
// does NOT touch icon.png or store-assets/play-store-icon-512.png.
//
// SCOPE (Req 10): writes only assets/images/adaptive-icon.png inside moph-meet/.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const OUT_ADAPTIVE = path.join(ROOT, 'assets', 'images', 'adaptive-icon.png');

// Pull the pristine 512x512 source straight from git as a binary buffer (no
// shell redirection, so binary stays intact).
function readPristineSource() {
  const buf = execSync('git show b8f818e:moph-meet/assets/images/icon.png', {
    cwd: ROOT,
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'buffer',
  });
  return PNG.sync.read(buf);
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
// (Behaviour matches scripts/gen-icons-hq.js / gen-adaptive-icon.js verbatim.)
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

// Composite a scaled RGBA buffer centered onto a destination PNG.
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
  const src = readPristineSource();
  console.log('=== adaptive-icon.png SMALLER regeneration (pristine 512 source) ===');
  console.log(`source: git b8f818e:moph-meet/assets/images/icon.png (${src.width}x${src.height})`);
  if (src.width !== 512 || src.height !== 512) {
    console.warn(`WARN: expected 512x512 pristine source, got ${src.width}x${src.height}.`);
  }
  const bbox = measureBBox(src);
  const diag = Math.sqrt(bbox.w * bbox.w + bbox.h * bbox.h);
  console.log(`content bbox: x=${bbox.x} y=${bbox.y} w=${bbox.w} h=${bbox.h} (diag=${diag.toFixed(1)})`);

  const CANVAS = 1024;
  const TARGET_FRAC = 0.36; // logo LARGER dimension ~= 36% of 1024 (~369px)
  const SAFE_FRACTION = 0.62; // circular safe zone
  const scale = (TARGET_FRAC * CANVAS) / Math.max(bbox.w, bbox.h);
  // Floor so the integer pixel size never exceeds the target (padding guarantee).
  const dstW = Math.max(1, Math.floor(bbox.w * scale));
  const dstH = Math.max(1, Math.floor(bbox.h * scale));
  const scaledDiag = Math.sqrt(dstW * dstW + dstH * dstH);
  const scaled = scaleRegion(src, bbox, dstW, dstH);

  const png = new PNG({ width: CANVAS, height: CANVAS });
  png.data.fill(0); // fully transparent canvas
  const { offX, offY } = compositeCentered(png, scaled, dstW, dstH, CANVAS);
  fs.writeFileSync(OUT_ADAPTIVE, PNG.sync.write(png));

  const largerDim = Math.max(dstW, dstH);
  const frac = largerDim / CANVAS;
  console.log('\nadaptive-icon.png');
  console.log(`    canvas ${CANVAS}x${CANVAS} transparent`);
  console.log(`    scale=${scale.toFixed(4)} (bbox max ${Math.max(bbox.w, bbox.h)} -> target ${(TARGET_FRAC * CANVAS).toFixed(1)}px)`);
  console.log(`    logo ${dstW}x${dstH} at offset (${offX},${offY}), diag=${scaledDiag.toFixed(1)}`);
  console.log(`    larger dim = ${largerDim}px = ${(frac * 100).toFixed(2)}% of canvas`);
  console.log(`    transparent padding each side (min) = ${Math.min(offX, offY)}px`);
  console.log(`    FITS 0.62 circle (${(SAFE_FRACTION * CANVAS).toFixed(1)}px)? ${scaledDiag <= SAFE_FRACTION * CANVAS ? 'YES' : 'NO'}`);
  console.log(`    wrote: ${OUT_ADAPTIVE}`);
}

main();
