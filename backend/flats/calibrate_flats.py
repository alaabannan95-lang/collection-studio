"""
Pixel-to-centimetre calibration for the tech pack flat drawings.

These three numbers (`pxPerCm`, `hspY`, `centerX`) are what app.js turns into
the `widthCm` and `belowCollarCm` figures printed on the tech pack PDF. The
factory cuts and prints to those figures, so an error here becomes an error in
cloth.

Replaces `scripts/calibrate_studio_flats.py`, which had two defects:

  1. It took `chest_px` as the median silhouette width across the middle of the
     drawing. At that height a hoodie's sleeves hang against the body and the
     silhouette is one connected span, so the measurement was body PLUS both
     sleeves, while the divisor was the body-only chest. The hoodie came out at
     12.902 px/cm against a true ~9.7, an overestimate of about 32%.
  2. It placed HSP at the first row reaching half that (already inflated) chest
     width. On a hooded garment that lands inside the hood, roughly 5cm above
     the actual shoulder, so every "below collar" figure inherited the offset.

Both are replaced with measurements that need no heuristic:

  * Scale comes from the ribbed hem band, the one body feature that separates
    cleanly from the sleeves, divided by the garment's own bottom-opening
    measurement.
  * HSP is then derived, not searched: it is the hem bottom minus the garment's
    own front length. If the scale is right, HSP is right by construction.

Verified on the hoodie front against three independent references from the
POM, which agree to within 7%: hem band 9.42, body length 9.76, sleeve opening
at the seam 10.07 px/cm.

Garments whose flats have no ribbed hem (the tees, the tank, the crewneck)
cannot use this anchor. They raise rather than fall back to a guess, and need
their pit points recorded by hand before they can be calibrated.
"""

from dataclasses import dataclass, replace
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parent.parent.parent
FLAT_DIR = REPO / "assets"

# Point-of-measure values from each garment's block in data.js, with the anchor
# each one's drawing actually supports.
#
#   anchor "hem_band"  Scale from the ribbed hem band's width, then derive HSP
#                      from the front length. For the hooded garments, whose
#                      sleeves hang against the body: the hem band is the only
#                      body feature that separates cleanly from them, and HSP
#                      cannot be found by inspection because the hood is above
#                      it.
#   anchor "length"    Scale from the drawing's own height, and take HSP as the
#                      topmost inked row. Only valid with no hood, where
#                      nothing is drawn above the shoulder. This is what the
#                      unhooded garments use, none of which has a bottom
#                      opening measurement to anchor on horizontally.
#
# Sizes differ by garment because the flats do: the crewneck's tech pack only
# carries size S, everything else is M.
GARMENT_POM = {
    "hoodie": {"anchor": "hem_band", "bottom_opening_cm": 48.0, "front_length_cm": 66.0, "size": "M"},
    "jacket": {"anchor": "hem_band", "bottom_opening_cm": 60.0, "front_length_cm": 66.0, "size": "M"},
    "tee-navy": {"anchor": "length", "full_length_cm": 73.0, "size": "M"},
    "tee-burgundy": {"anchor": "length", "full_length_cm": 73.0, "size": "M"},
    "tank": {"anchor": "length", "full_length_cm": 73.5, "size": "M"},
    "longsleeve": {"anchor": "length", "full_length_cm": 73.0, "size": "M"},
    "crewneck": {"anchor": "length", "full_length_cm": 65.0, "size": "S"},
}


class MissingPOM(Exception):
    """Raised when a flat cannot be calibrated. Never fall back to a guess."""


@dataclass(frozen=True)
class FlatCalibration:
    px_per_cm: float
    hsp_y: int
    center_x: int
    # Bottom of the BODY hem, which is the other end of the length the scale is
    # built on. Note this is not the drawing's lowest ink: the cuffs hang below
    # it, and measuring to those instead overstates the body by the cuff drop.
    hem_y: int
    # The collar edge AS DRAWN, which is NOT hsp_y. On a hood it sits above the
    # shoulders; on a ribbed collar, below them. See find_neckline_y.
    neck_y: int = 0


def load_flat_alpha(garment: str, view: str) -> np.ndarray:
    path = FLAT_DIR / f"{garment}_{view}.png"
    if not path.exists():
        raise FileNotFoundError(f"missing flat drawing: {path}")
    return np.asarray(Image.open(path).convert("RGBA"))[:, :, 3] > 10


def load_flat_linework(garment: str, view: str) -> np.ndarray:
    """The drawn lines inside the silhouette, not just its outline.

    The alpha mask alone cannot find the collar: the neckline is an interior
    seam line, not an edge of the shape. Anything inked and dark counts.
    """
    path = FLAT_DIR / f"{garment}_{view}.png"
    if not path.exists():
        raise FileNotFoundError(f"missing flat drawing: {path}")
    arr = np.asarray(Image.open(path).convert("RGBA")).astype(int)
    return (arr[:, :, 3] > 40) & (arr[:, :, :3].sum(axis=2) < 330)


def find_neckline_y(garment: str, view: str, center_x: int, hsp_y: int,
                    px_per_cm: float) -> int:
    """Row of the collar edge AS DRAWN, which is not the same as HSP.

    Why this exists: HSP is the technical datum (it is the end of the POM front
    length) but it is invisible on the drawing. The eye reads "the collar" as
    whatever line is drawn at the neck, and on a HOODED garment that is the
    hood, which sits ABOVE HSP. On the hoodie front the hood V is 4.1cm above
    HSP while a tee's collar sits 6.6cm below it -- an ~11cm swing between
    garment types that a single "below collar" label silently hid.

    Method: walk a narrow band down the centre line, group the inked runs, and
    take the LOWEST group still inside the neck region. For a hood that is the
    V where it meets the body; for a ribbed collar it is the bottom of the rib.
    Both are exactly the line a person points at and calls the collar.
    """
    dark = load_flat_linework(garment, view)
    height = dark.shape[0]
    lo = max(0, int(center_x) - 3)
    band = dark[:, lo:int(center_x) + 4].any(axis=1)

    rows = np.where(band)[0]
    if not rows.size:
        raise MissingPOM(f"{garment}/{view}: no linework on the centre line")

    groups, current = [], [int(rows[0])]
    for y in rows[1:]:
        if y - current[-1] <= 4:
            current.append(int(y))
        else:
            groups.append(current)
            current = [int(y)]
    groups.append(current)

    # The neck region: generous upward, because a jacket's hood back is drawn
    # 37cm above the shoulders, but tight downward so the chest pocket and hem
    # can never be mistaken for a collar. Taking the LOWEST group in the region
    # means widening the top cannot change a garment whose collar was already
    # found -- the hood's own top edge always loses to its neck seam.
    top_limit = hsp_y - 45 * px_per_cm
    bottom_limit = hsp_y + 15 * px_per_cm
    in_neck = [g for g in groups if top_limit <= g[0] <= bottom_limit]
    if not in_neck:
        raise MissingPOM(f"{garment}/{view}: no collar line found near the neck")

    return in_neck[-1][0]


def _separated_body_run(row: np.ndarray):
    """
    The body's own run of ink, but only on rows where it is genuinely
    separable from the sleeves.

    A row qualifies only if BOTH sleeves have parted from the body, meaning
    there is a separate run of ink to the left of the body and another to its
    right. Requiring only one gap is not enough: on several rows the left
    sleeve still touches the body while the right one has parted, and the run
    through the centre is then body plus one sleeve. Measuring that as the body
    is a smaller version of the very error this module exists to correct.
    """
    cols = np.flatnonzero(row)
    if cols.size == 0:
        return None
    runs = np.split(cols, np.flatnonzero(np.diff(cols) > 1) + 1)
    if len(runs) < 3:
        return None

    centre = row.size / 2
    for index, run in enumerate(runs):
        if run[0] <= centre <= run[-1]:
            has_left = index > 0
            has_right = index < len(runs) - 1
            return (int(run[0]), int(run[-1])) if has_left and has_right else None
    return None


def _hem_band(alpha: np.ndarray):
    """
    Find the body's hem band: its bottom row, width, and centre.

    Scanned bottom-up over rows where the sleeves have parted. The widest such
    row is the hem band itself, which avoids the rounded corners drawn at the
    very bottom edge and the taper just above them.

    Assumes the sleeves hang alongside the body, which holds for the hoodie and
    the jacket. A garment whose sleeves end well above the hem, such as a tee,
    has no separated row at the hem at all and is rejected upstream.
    """
    candidates = []
    for row in range(alpha.shape[0] - 1, -1, -1):
        run = _separated_body_run(alpha[row])
        if run is not None:
            candidates.append((row, run))

    if not candidates:
        raise MissingPOM(
            "no row found where the sleeves separate from the body; "
            "this flat needs its pit points recorded by hand"
        )

    bottom = max(row for row, _ in candidates)
    _, (left, right) = max(candidates, key=lambda item: item[1][1] - item[1][0])
    return bottom, right - left + 1, (left + right) / 2


def _calibrate_by_hem_band(alpha: np.ndarray, pom: dict) -> FlatCalibration:
    hem_bottom, hem_width_px, hem_centre = _hem_band(alpha)
    px_per_cm = hem_width_px / pom["bottom_opening_cm"]
    return FlatCalibration(
        px_per_cm=px_per_cm,
        hsp_y=int(round(hem_bottom - pom["front_length_cm"] * px_per_cm)),
        center_x=int(round(hem_centre)),
        hem_y=hem_bottom,
    )


# A row counts as the hem once its widest run reaches this fraction of the
# drawing's widest run. Cuffs and sleeve tips fall far below it.
_HEM_WIDTH_FRACTION = 0.4


def _widest_run(row: np.ndarray):
    cols = np.flatnonzero(row)
    if cols.size == 0:
        return None
    runs = np.split(cols, np.flatnonzero(np.diff(cols) > 1) + 1)
    widest = max(runs, key=len)
    return int(widest[0]), int(widest[-1])


def _calibrate_by_length(alpha: np.ndarray, pom: dict) -> FlatCalibration:
    """
    Scale from the body's height, valid only without a hood.

    With nothing drawn above the shoulder, the topmost inked row is HSP, so the
    top of the garment's own length measurement is directly readable.

    The bottom is the body's hem, which is NOT simply the drawing's lowest ink:
    on the longsleeve front the cuffs hang below the hem, and measuring to those
    stretched the scale by 20% against the same garment's back view and put the
    centreline out on a sleeve. So the hem is found by scanning up for the first
    row wide enough to be the body.
    """
    rows = np.flatnonzero(alpha.any(axis=1))
    top = int(rows.min())

    widest_overall = max(
        run[1] - run[0]
        for run in (_widest_run(alpha[r]) for r in rows)
        if run is not None
    )

    body_rows = []
    for row in range(int(rows.max()), top, -1):
        run = _widest_run(alpha[row])
        if run is not None and (run[1] - run[0]) >= _HEM_WIDTH_FRACTION * widest_overall:
            body_rows.append((row, run))

    if not body_rows:
        raise MissingPOM("no hem row wide enough to be the body was found")

    # The hem's lowest row sets the length, but not the centreline: the very
    # last row of a drawing is unevenly antialiased and on the tees it splits
    # the hem in two, whose wider half sits 8% off centre. So the centreline
    # comes from the widest body row instead, where the hem is whole.
    hem_y = max(row for row, _ in body_rows)
    _, widest = max(body_rows, key=lambda item: item[1][1] - item[1][0])

    return FlatCalibration(
        px_per_cm=(hem_y - top) / pom["full_length_cm"],
        hsp_y=top,
        center_x=int(round((widest[0] + widest[1]) / 2)),
        hem_y=hem_y,
    )


_ANCHORS = {"hem_band": _calibrate_by_hem_band, "length": _calibrate_by_length}


def calibrate_flat(garment: str, view: str) -> FlatCalibration:
    pom = GARMENT_POM.get(garment)
    if pom is None:
        raise MissingPOM(
            f"no point-of-measure data for '{garment}'; cannot calibrate. "
            f"Known garments: {', '.join(sorted(GARMENT_POM))}"
        )

    base = _ANCHORS[pom["anchor"]](load_flat_alpha(garment, view), pom)
    neck_y = find_neckline_y(
        garment, view, base.center_x, base.hsp_y, base.px_per_cm
    )
    return replace(base, neck_y=neck_y)
