/**
 * Print placement geometry, in real centimetres.
 *
 * The factory cuts and prints to these numbers, so they are kept in one place
 * with no browser dependencies: the studio uses them for the live readout, the
 * tech pack export sends the same values to the PDF, and tests/placement.test.mjs
 * checks them in Node. Nothing here touches the DOM or canvas.
 *
 * Datums (garment industry convention):
 *   - vertical from HSP (high shoulder point) DOWN to the highest point of the
 *     print, from the DRAWN NECKLINE down to that same point, and from the
 *     print's LOWEST point down to the hem.
 *   - horizontal from the garment centre line (CF), signed: positive is the
 *     wearer's left as the flat is viewed from the front.
 *
 * WHY HSP AND NECKLINE ARE BOTH REPORTED. HSP is the technical datum: it is
 * where the POM front length is measured from, and it is what a pattern cutter
 * works to. But HSP is invisible on a flat drawing. The eye reads "the collar"
 * as whatever line is drawn at the neck, and that is somewhere else entirely:
 *
 *     hoodie front   hood V sits  4.1cm ABOVE HSP
 *     jacket front   hood        5.6cm ABOVE HSP
 *     tee front      collar rib  6.6cm BELOW HSP
 *     tank front     scoop      11.8cm BELOW HSP
 *
 * So a single figure labelled "below collar" meant two different physical
 * distances depending on the garment, differing by up to 16cm. A print eyeballed
 * onto the chest of a hoodie reported 6.7cm from HSP while visibly sitting
 * 10.8cm below the hood -- correct arithmetic, misleading label. Both numbers
 * are now reported and named, so neither the studio nor the factory can pick
 * the wrong datum by accident.
 *
 * Rotation matters and is NOT ignored. A rotated print's highest point is the
 * corner of its rotated bounding box, not half its artwork height above centre.
 * A 20x10cm print rotated 45 degrees sits 5.6cm higher than the unrotated box
 * suggests -- an error the factory would print.
 */

/**
 * Axis-aligned bounding box of a print after rotation, in image pixels.
 * `w`/`h` are the artwork's own (pre-rotation) size; `rotation` is degrees.
 */
function printBoundsPx(p) {
  const rad = ((p.rotation || 0) * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const halfW = (p.w * cos + p.h * sin) / 2;
  const halfH = (p.w * sin + p.h * cos) / 2;
  return {
    top: p.cy - halfH,
    bottom: p.cy + halfH,
    left: p.cx - halfW,
    right: p.cx + halfW,
  };
}

/**
 * Every centimetre figure the tech pack prints for one placed print.
 *
 * `calib` is one view's entry from CALIBRATION (pxPerCm, hspY, hemY, centerX).
 *
 * Guarantees the invariant  belowCollarCm + printHeightCm + aboveHemCm
 * === the garment's collar-to-hem length, for any position and rotation. That
 * is what makes the two datums safe to print side by side.
 */
function printPlacementCm(p, calib) {
  const b = printBoundsPx(p);
  return {
    // The artwork's own width and height, pre-rotation. Tech-pack convention:
    // rotating a logo does not make the logo wider, so this is what the print
    // line reproduces at size.
    widthCm: p.w / calib.pxPerCm,
    heightCm: p.h / calib.pxPerCm,
    // Vertical space the print actually occupies on the garment, which does
    // grow with rotation.
    printHeightCm: (b.bottom - b.top) / calib.pxPerCm,
    // From HSP: the technical datum, what the factory's pattern cutter works to.
    belowCollarCm: (b.top - calib.hspY) / calib.pxPerCm,
    // From the collar edge as drawn: what the eye actually measures. Null only
    // if a calibration predates the neckline datum.
    belowNecklineCm: calib.necklineY == null
      ? null
      : (b.top - calib.necklineY) / calib.pxPerCm,
    aboveHemCm: (calib.hemY - b.bottom) / calib.pxPerCm,
    fromCenterCm: (p.cx - calib.centerX) / calib.pxPerCm,
  };
}

/**
 * Signed gap between the two neck datums, in cm. Positive means the drawn
 * collar sits BELOW HSP (a ribbed collar); negative means it sits ABOVE (a
 * hood). This is the number that explains why the two readings differ.
 */
function necklineOffsetCm(calib) {
  if (calib.necklineY == null) return null;
  return (calib.necklineY - calib.hspY) / calib.pxPerCm;
}

/** Collar-to-hem body length this calibration describes, in cm. */
function garmentLengthCm(calib) {
  return (calib.hemY - calib.hspY) / calib.pxPerCm;
}

/** Minimum share of a print's own bounding box that must stay on the canvas. */
const MIN_VISIBLE_FRACTION = 0.25;
/**
 * ...but never less than this many pixels on each axis, or the whole print if
 * it is smaller than that. A fraction alone is not enough: artwork does not
 * fill its bounding box, so the 11px corner sliver left of a thin text layer
 * contained no ink at all and still looked lost.
 */
const MIN_VISIBLE_PX = 60;

/**
 * Keeps a dragged print reachable.
 *
 * Free placement is deliberate: a print that runs off a sleeve or over the hem
 * is a real design, so this does NOT confine prints to the garment. It enforces
 * one rule only -- at least MIN_VISIBLE_FRACTION of the print's own bounding box
 * stays on the canvas, so it can always be seen and grabbed again.
 *
 * The bug this replaces: the clamp used to bound the CENTRE to a fixed +/-25%
 * of the canvas past each edge, with no reference to the print's size. Drag a
 * print past a corner and its centre stopped 235px out while the print itself
 * was only ~200px wide, leaving it entirely off-canvas. It stayed in the layer
 * list and stayed selected, but drew nothing, and recolouring could not reveal
 * it because there was nothing on the canvas to recolour.
 *
 * Bounds are taken from the ROTATED box, so a wide print turned on its side is
 * held by the height it actually occupies.
 */
function clampPrintCenterPx(p, canvasW, canvasH, minVisibleFraction) {
  const frac = minVisibleFraction == null ? MIN_VISIBLE_FRACTION : minVisibleFraction;
  const origin = printBoundsPx({ cx: 0, cy: 0, w: p.w, h: p.h, rotation: p.rotation });
  const halfW = origin.right;
  const halfH = origin.bottom;

  // How much of each axis has to remain on canvas: a quarter of the print, or
  // MIN_VISIBLE_PX, whichever is larger -- but never more than the print has.
  // A print smaller than MIN_VISIBLE_PX must therefore stay fully on canvas.
  const needX = Math.max(halfW * 2 * frac, Math.min(halfW * 2, MIN_VISIBLE_PX));
  const needY = Math.max(halfH * 2 * frac, Math.min(halfH * 2, MIN_VISIBLE_PX));

  // Slack is how far the centre may pass the edge. It goes negative for a small
  // print, which correctly pushes the centre back inside the canvas.
  const slackX = halfW - needX;
  const slackY = halfH - needY;

  return {
    cx: Math.max(-slackX, Math.min(canvasW + slackX, p.cx)),
    cy: Math.max(-slackY, Math.min(canvasH + slackY, p.cy)),
  };
}
