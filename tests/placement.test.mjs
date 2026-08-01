/**
 * Print placement geometry.
 *
 * The factory cuts and prints to the centimetre figures on the tech pack, so
 * these have to be right for ANY position and ANY rotation, measured both from
 * the collar (HSP) and from the hem.
 *
 * Run:  node --test tests/placement.test.mjs
 * Also run as part of pytest via tests/test_print_placement.py.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const STUDIO = join(HERE, '..');

// placement.js and data.js are plain browser scripts (no modules). Evaluate
// them as ONE script: top-level `const` is script-scoped, so loading them
// separately would hide data.js's CALIBRATION from the later lookup.
const sandbox = { Math, console };
vm.createContext(sandbox);
const source = ['placement.js', 'data.js']
  .map(f => readFileSync(join(STUDIO, f), 'utf8'))
  .join('\n;\n');
const {
  printBoundsPx, printPlacementCm, necklineOffsetCm, clampPrintCenterPx, CALIBRATION,
} = vm.runInContext(
  `${source}\n;({ printBoundsPx, printPlacementCm, necklineOffsetCm, clampPrintCenterPx, CALIBRATION })`,
  sandbox,
  { filename: 'studio-bundle.js' }
);

// A stand-in calibration with round numbers, so expected values stay obvious.
// necklineY sits 20px (2cm) below HSP, as a ribbed collar would.
const CAL = { pxPerCm: 10, hspY: 100, necklineY: 120, hemY: 700, centerX: 400 };
// 60cm from HSP to hem: (700 - 100) / 10.

test('unrotated print measures from its own top and bottom edges', () => {
  const p = { cx: 400, cy: 300, w: 200, h: 100, rotation: 0 };
  const m = printPlacementCm(p, CAL);
  assert.equal(m.widthCm, 20);
  assert.equal(m.heightCm, 10);
  // top edge at 250px = 15cm below the 100px HSP
  assert.equal(m.belowCollarCm, 15);
  // bottom edge at 350px, hem at 700px = 35cm above the hem
  assert.equal(m.aboveHemCm, 35);
  assert.equal(m.fromCenterCm, 0);
});

test('rotation is accounted for: a rotated print sits higher than its unrotated box', () => {
  const base = { cx: 400, cy: 300, w: 200, h: 100 };
  const flat = printPlacementCm({ ...base, rotation: 0 }, CAL);
  const tilted = printPlacementCm({ ...base, rotation: 45 }, CAL);
  // Rotating a wide print makes it taller, so its highest point rises and its
  // lowest point drops. Ignoring rotation was reporting the flat numbers.
  assert.ok(tilted.belowCollarCm < flat.belowCollarCm - 5,
    `rotated top should rise well above ${flat.belowCollarCm}, got ${tilted.belowCollarCm}`);
  assert.ok(tilted.aboveHemCm < flat.aboveHemCm - 5,
    `rotated bottom should drop well below, got ${tilted.aboveHemCm}`);
});

test('90 degrees swaps the occupied height with the width', () => {
  const m = printPlacementCm({ cx: 400, cy: 300, w: 200, h: 100, rotation: 90 }, CAL);
  // Turned on its side, the 20cm-wide artwork now occupies 20cm vertically.
  assert.ok(Math.abs(m.printHeightCm - 20) < 1e-9, `got ${m.printHeightCm}`);
  // Reported artwork width stays the artwork's own width, per tech-pack
  // convention -- rotation does not make the logo "wider".
  assert.equal(m.widthCm, 20);
});

test('the three vertical figures always add up to the garment length', () => {
  // collar-to-top + print height + bottom-to-hem == collar-to-hem.
  // This is the invariant that makes the two datums trustworthy together.
  const lengthCm = (CAL.hemY - CAL.hspY) / CAL.pxPerCm;
  for (const rotation of [0, 12, 45, 90, 137, -30]) {
    for (const cy of [200, 300, 450, 600]) {
      const m = printPlacementCm({ cx: 400, cy, w: 200, h: 100, rotation }, CAL);
      const sum = m.belowCollarCm + m.printHeightCm + m.aboveHemCm;
      assert.ok(Math.abs(sum - lengthCm) < 1e-9,
        `rotation ${rotation} at cy ${cy}: ${sum} != ${lengthCm}`);
    }
  }
});

test('horizontal placement is signed from the centre line', () => {
  const right = printPlacementCm({ cx: 480, cy: 300, w: 100, h: 100, rotation: 0 }, CAL);
  const left = printPlacementCm({ cx: 320, cy: 300, w: 100, h: 100, rotation: 0 }, CAL);
  assert.equal(right.fromCenterCm, 8);
  assert.equal(left.fromCenterCm, -8);
});

test('a print below the hem reports a negative distance rather than lying', () => {
  const m = printPlacementCm({ cx: 400, cy: 750, w: 100, h: 100, rotation: 0 }, CAL);
  assert.ok(m.aboveHemCm < 0, `expected negative, got ${m.aboveHemCm}`);
});

test('bounds are symmetric for equivalent rotations', () => {
  const a = printBoundsPx({ cx: 400, cy: 300, w: 200, h: 100, rotation: 30 });
  const b = printBoundsPx({ cx: 400, cy: 300, w: 200, h: 100, rotation: -30 });
  assert.ok(Math.abs((a.bottom - a.top) - (b.bottom - b.top)) < 1e-9);
  assert.ok(Math.abs((a.right - a.left) - (b.right - b.left)) < 1e-9);
});

test('missing rotation is treated as zero, not NaN', () => {
  const m = printPlacementCm({ cx: 400, cy: 300, w: 200, h: 100 }, CAL);
  assert.equal(m.belowCollarCm, 15);
  assert.ok(Number.isFinite(m.aboveHemCm));
});

test('every shipped calibration carries a usable hem datum', () => {
  for (const [garment, views] of Object.entries(CALIBRATION)) {
    for (const [view, c] of Object.entries(views)) {
      assert.ok(typeof c.hemY === 'number', `${garment}/${view} has no hemY`);
      assert.ok(c.hemY > c.hspY, `${garment}/${view}: hem must sit below HSP`);
      const lengthCm = (c.hemY - c.hspY) / c.pxPerCm;
      // Every SOAP garment is a top; none is under 40cm or over 90cm long.
      assert.ok(lengthCm > 40 && lengthCm < 90,
        `${garment}/${view}: implausible body length ${lengthCm.toFixed(1)}cm`);
    }
  }
});

test('the neckline reading differs from the HSP reading by the datum gap', () => {
  const p = { cx: 400, cy: 300, w: 200, h: 100, rotation: 0 };
  const m = printPlacementCm(p, CAL);
  // HSP at 100px, drawn collar at 120px, print top at 250px.
  assert.equal(m.belowCollarCm, 15);   // from HSP
  assert.equal(m.belowNecklineCm, 13); // from the collar you can see
  assert.equal(necklineOffsetCm(CAL), 2);
  assert.equal(m.belowCollarCm - m.belowNecklineCm, necklineOffsetCm(CAL));
});

test('a hood makes the neckline reading LARGER than the HSP reading', () => {
  // The hoodie's drawn collar sits above HSP, so the visible gap is the bigger
  // number. This is the case that made a chest print read "6.7cm" while
  // visibly sitting ~10.8cm below the hood.
  const hood = { pxPerCm: 10, hspY: 100, necklineY: 60, hemY: 700, centerX: 400 };
  const m = printPlacementCm({ cx: 400, cy: 300, w: 200, h: 100, rotation: 0 }, hood);
  assert.equal(m.belowCollarCm, 15);
  assert.equal(m.belowNecklineCm, 19);
  assert.ok(m.belowNecklineCm > m.belowCollarCm);
  assert.equal(necklineOffsetCm(hood), -4);
});

test('every shipped calibration carries a neckline datum, and hoods sit above HSP', () => {
  const hooded = new Set(['hoodie', 'jacket']);
  for (const [garment, views] of Object.entries(CALIBRATION)) {
    for (const [view, c] of Object.entries(views)) {
      assert.ok(typeof c.necklineY === 'number', `${garment}/${view} has no necklineY`);
      const offset = necklineOffsetCm(c);
      if (hooded.has(garment)) {
        assert.ok(offset < 0,
          `${garment}/${view}: a hood must sit ABOVE HSP, got ${offset.toFixed(1)}cm`);
      } else {
        assert.ok(offset >= 0,
          `${garment}/${view}: a collar must sit at or below HSP, got ${offset.toFixed(1)}cm`);
        assert.ok(offset < 15,
          `${garment}/${view}: neck drop ${offset.toFixed(1)}cm is implausible`);
      }
      // The collar can never be below the hem.
      assert.ok(c.necklineY < c.hemY, `${garment}/${view}`);
    }
  }
});

test('front necklines are deeper than back necklines on unhooded garments', () => {
  // A real physical invariant: front neck drop always exceeds back neck drop.
  // It holding across the whole collection is the check that the detected
  // collar line is the actual collar and not some other bit of linework.
  for (const [garment, views] of Object.entries(CALIBRATION)) {
    if (garment === 'hoodie' || garment === 'jacket') continue;
    const front = necklineOffsetCm(views.front);
    const back = necklineOffsetCm(views.back);
    assert.ok(front >= back,
      `${garment}: front ${front.toFixed(1)}cm should be >= back ${back.toFixed(1)}cm`);
  }
});

// ---------------------------------------------------------------------------
// Dragging a print must never lose it.
//
// The old drag clamp bounded the print's CENTRE to +/-25% of the canvas past
// each edge, ignoring the print's own size. A print dragged past a corner ended
// up entirely outside the canvas: still listed, still selected, drawing nothing,
// and impossible to find by eye or by recolouring it.
// ---------------------------------------------------------------------------

const CANVAS = { w: 941, h: 1038 };

/** Visible overlap with the canvas, per axis and in pixels.
 *
 * The contract is per-axis: at least 25% of the print's width AND 25% of its
 * height stay on the canvas. At a corner both clip at once, so the visible
 * AREA can be as little as 25% x 25%. That is still a large, clickable target,
 * which is what actually matters.
 */
function visibleOverlap(p, canvasW, canvasH) {
  const b = printBoundsPx(p);
  const overlapW = Math.min(b.right, canvasW) - Math.max(b.left, 0);
  const overlapH = Math.min(b.bottom, canvasH) - Math.max(b.top, 0);
  return {
    px: { w: Math.max(0, overlapW), h: Math.max(0, overlapH) },
    fracW: Math.max(0, overlapW) / (b.right - b.left),
    fracH: Math.max(0, overlapH) / (b.bottom - b.top),
  };
}

const visible = (p, w, h) => {
  const o = visibleOverlap(p, w, h);
  return o.px.w > 0 && o.px.h > 0;
};

test('a print dragged far past a corner stays partly on the canvas', () => {
  const wanted = { cx: 5000, cy: 6000, w: 398, h: 191, rotation: 0 };
  const c = clampPrintCenterPx(wanted, CANVAS.w, CANVAS.h);
  const o = visibleOverlap({ ...wanted, ...c }, CANVAS.w, CANVAS.h);

  assert.ok(o.px.w > 0 && o.px.h > 0, 'print must not vanish entirely');
  assert.ok(o.fracW >= 0.25 - 1e-9, `width visible ${(o.fracW * 100).toFixed(0)}%`);
  assert.ok(o.fracH >= 0.25 - 1e-9, `height visible ${(o.fracH * 100).toFixed(0)}%`);
});

test('a small print cannot be pushed off any edge at all', () => {
  // Artwork does not fill its bounding box. A quarter of a thin text layer is
  // an 11px corner sliver with no ink in it, which still looks lost -- so
  // anything under the pixel floor has to stay fully on canvas.
  const small = { w: 171, h: 47, rotation: 0 };
  for (const [cx, cy] of [[-9000, -9000], [9000, 9000], [-9000, 9000], [9000, -9000]]) {
    const c = clampPrintCenterPx({ ...small, cx, cy }, CANVAS.w, CANVAS.h);
    const o = visibleOverlap({ ...small, ...c }, CANVAS.w, CANVAS.h);
    assert.ok(o.fracH >= 1 - 1e-9,
      `47px-tall text should stay fully visible vertically, got ${(o.fracH * 100).toFixed(0)}%`);
    assert.ok(o.px.w >= 60 - 1e-9,
      `expected >=60px of width on canvas, got ${o.px.w.toFixed(0)}px`);
  }
});

test('every print keeps a grabbable amount on canvas, whatever its size', () => {
  const sizes = [
    { w: 40, h: 20 }, { w: 171, h: 47 }, { w: 398, h: 191 }, { w: 900, h: 700 },
  ];
  for (const s of sizes) {
    for (const rotation of [0, 30, 90]) {
      for (const [cx, cy] of [[-9000, -9000], [9000, 9000]]) {
        const c = clampPrintCenterPx({ ...s, rotation, cx, cy }, CANVAS.w, CANVAS.h);
        const o = visibleOverlap({ ...s, rotation, ...c }, CANVAS.w, CANVAS.h);
        const b = printBoundsPx({ ...s, rotation, cx: 0, cy: 0 });
        const needX = Math.max(b.right * 2 * 0.25, Math.min(b.right * 2, 60));
        const needY = Math.max(b.bottom * 2 * 0.25, Math.min(b.bottom * 2, 60));
        assert.ok(o.px.w >= needX - 1e-6,
          `${s.w}x${s.h}@${rotation}: ${o.px.w.toFixed(0)}px wide visible, need ${needX.toFixed(0)}`);
        assert.ok(o.px.h >= needY - 1e-6,
          `${s.w}x${s.h}@${rotation}: ${o.px.h.toFixed(0)}px tall visible, need ${needY.toFixed(0)}`);
      }
    }
  }
});

test('every direction is bounded, not just the bottom-right', () => {
  const base = { w: 300, h: 120, rotation: 0 };
  const far = [
    [-9000, 500], [9000, 500], [500, -9000], [500, 9000],
    [-9000, -9000], [9000, 9000], [-9000, 9000], [9000, -9000],
  ];
  for (const [cx, cy] of far) {
    const c = clampPrintCenterPx({ ...base, cx, cy }, CANVAS.w, CANVAS.h);
    assert.ok(visible({ ...base, ...c }, CANVAS.w, CANVAS.h),
      `lost the print dragging to ${cx},${cy}`);
  }
});

test('a rotated print is bounded by its rotated size, not its artwork size', () => {
  // A wide print turned 90 degrees is tall; clamping on the un-rotated height
  // would let it slide off the bottom.
  const p = { cx: 500, cy: 9000, w: 400, h: 60, rotation: 90 };
  const c = clampPrintCenterPx(p, CANVAS.w, CANVAS.h);
  assert.ok(visible({ ...p, ...c }, CANVAS.w, CANVAS.h),
    'rotated print slipped off the canvas');
});

test('placement well inside the canvas is left completely alone', () => {
  const p = { cx: 471, cy: 456, w: 171, h: 47, rotation: 0 };
  const c = clampPrintCenterPx(p, CANVAS.w, CANVAS.h);
  assert.equal(c.cx, 471);
  assert.equal(c.cy, 456);
});

test('a print may still hang well off an edge, just not disappear', () => {
  // Free placement is deliberate: prints that run off a sleeve or hem are a
  // real design. The rule is only that something stays reachable.
  const p = { cx: 941, cy: 500, w: 300, h: 100, rotation: 0 };
  const c = clampPrintCenterPx(p, CANVAS.w, CANVAS.h);
  assert.equal(c.cx, 941, 'a centre exactly on the edge is still allowed');
  assert.ok(visible({ ...p, ...c }, CANVAS.w, CANVAS.h));
});

test('a calibration without a neckline degrades to null, not NaN', () => {
  const legacy = { pxPerCm: 10, hspY: 100, hemY: 700, centerX: 400 };
  const m = printPlacementCm({ cx: 400, cy: 300, w: 200, h: 100, rotation: 0 }, legacy);
  assert.equal(m.belowNecklineCm, null);
  assert.equal(necklineOffsetCm(legacy), null);
  assert.equal(m.belowCollarCm, 15);
});
