"""
Calibration of the tech pack flats.

These numbers are not cosmetic. `pxPerCm`, `hspY` and `centerX` are what
app.js turns into the `widthCm` and `belowCollarCm` figures printed on the
tech pack PDF, which the factory then cuts and prints to. A wrong scale here
becomes a wrong garment.

The property being tested: a calibration is correct when independent features
of the drawing, measured with it, reproduce the garment's own point-of-measure
values. One reference could be a coincidence; three agreeing cannot.
"""

import numpy as np
import pytest
from PIL import Image

from backend.flats.calibrate_flats import calibrate_flat, load_flat_alpha

# Hoodie, size M, straight from the tech pack POM in data.js.
HOODIE_M = {
    "bottom_opening_cm": 48.0,
    "front_length_cm": 66.0,
    "sleeve_opening_at_seam_cm": 13.5,
    "chest_cm": 61.5,
}


@pytest.fixture
def hoodie_front():
    try:
        return load_flat_alpha("hoodie", "front")
    except FileNotFoundError:
        pytest.skip("hoodie front flat missing")


def test_scale_reproduces_the_body_length(hoodie_front):
    """
    Measured to the BODY hem, not the drawing's lowest ink. The cuffs hang
    below the hem, so measuring to those would overstate the body by the cuff
    drop, about 12cm on this garment.
    """
    calib = calibrate_flat("hoodie", "front")
    measured_cm = (calib.hem_y - calib.hsp_y) / calib.px_per_cm
    assert measured_cm == pytest.approx(HOODIE_M["front_length_cm"], rel=0.08)


def test_scale_reproduces_the_sleeve_opening(hoodie_front):
    """
    The sleeve opening at the rib seam is an independent check: it is nowhere
    near the hem the scale is derived from, so agreement is meaningful.
    """
    calib = calibrate_flat("hoodie", "front")
    # Widest row of the left cuff rib, which is the seam where the rib joins.
    rows = range(870, 900)
    widths = []
    for row in rows:
        cols = np.flatnonzero(hoodie_front[row])
        cols = cols[cols < 400]
        if cols.size:
            widths.append(cols.max() - cols.min() + 1)
    measured_cm = max(widths) / calib.px_per_cm
    assert measured_cm == pytest.approx(HOODIE_M["sleeve_opening_at_seam_cm"], rel=0.12)


def test_scale_is_far_from_the_old_broken_value(hoodie_front):
    """
    The previous calibration returned 12.902 px/cm because it measured the
    whole silhouette, sleeves included, and divided by the body-only chest.
    Guard against ever drifting back to it.
    """
    calib = calibrate_flat("hoodie", "front")
    assert calib.px_per_cm < 11.0


def test_hsp_lands_on_the_shoulder_not_in_the_hood(hoodie_front):
    """
    The old heuristic took the first row reaching half the chest width, which
    on a hooded garment lands inside the hood, about 5cm above the real
    shoulder. Every "below collar" figure on the tech pack inherits that error.
    """
    calib = calibrate_flat("hoodie", "front")
    top = int(np.flatnonzero(hoodie_front.any(axis=1)).min())
    hood_depth_px = calib.hsp_y - top
    assert hood_depth_px / calib.px_per_cm > 5.0


def test_centre_is_the_body_centreline(hoodie_front):
    calib = calibrate_flat("hoodie", "front")
    cols = np.flatnonzero(hoodie_front.any(axis=0))
    silhouette_centre = (cols.min() + cols.max()) / 2
    assert abs(calib.center_x - silhouette_centre) < 0.03 * hoodie_front.shape[1]


def test_every_calibratable_garment_and_view_works(hoodie_front):
    from backend.flats.calibrate_flats import GARMENT_POM

    for garment in GARMENT_POM:
        for view in ("front", "back"):
            calib = calibrate_flat(garment, view)
            assert 5.0 < calib.px_per_cm < 25.0, f"{garment}/{view}"
            assert calib.hsp_y > 0, f"{garment}/{view}"



# ---------------------------------------------------------------------------
# Unhooded garments: tees, tank, longsleeve, crewneck.
#
# These have no ribbed hem band to anchor on horizontally. What they do have is
# a length measurement and, critically, no hood: their highest ink IS the
# shoulder, so HSP needs no searching and the scale can come from the vertical
# length instead.
# ---------------------------------------------------------------------------

UNHOODED = ("tee-navy", "tee-burgundy", "tank", "longsleeve", "crewneck")


@pytest.mark.parametrize("garment", UNHOODED)
def test_unhooded_garment_calibrates(garment):
    calib = calibrate_flat(garment, "front")
    assert 5.0 < calib.px_per_cm < 25.0


@pytest.mark.parametrize("garment", UNHOODED)
def test_unhooded_hsp_is_the_topmost_ink(garment):
    """
    With no hood there is nothing above the shoulder, so HSP is simply the
    drawing's first inked row. The hooded garments cannot use this, which is
    why they get a different anchor.
    """
    calib = calibrate_flat(garment, "front")
    alpha = load_flat_alpha(garment, "front")
    assert calib.hsp_y == int(np.flatnonzero(alpha.any(axis=1)).min())


def test_tank_scale_reproduces_the_armhole_opening():
    """
    Independent cross-check. A tank is sleeveless, so its widest body row is
    the chest and nothing else can be confused for it. The POM calls that
    'Armhole to armhole opening', 55cm.
    """
    calib = calibrate_flat("tank", "front")
    alpha = load_flat_alpha("tank", "front")
    widths = [
        np.flatnonzero(row).max() - np.flatnonzero(row).min() + 1
        for row in alpha
        if row.any()
    ]
    assert max(widths) / calib.px_per_cm == pytest.approx(55.0, rel=0.15)


def test_every_garment_in_the_collection_calibrates():
    """No garment may be left on the old, wrong numbers."""
    for garment in ("hoodie", "jacket") + UNHOODED:
        for view in ("front", "back"):
            calib = calibrate_flat(garment, view)
            assert 5.0 < calib.px_per_cm < 25.0, f"{garment}/{view}"
            assert calib.hsp_y >= 0, f"{garment}/{view}"


def test_a_garment_with_no_measurements_still_refuses():
    """
    A plausible-looking wrong scale is worse than no answer, because it reaches
    the factory as a printed centimetre figure.
    """
    from backend.flats.calibrate_flats import MissingPOM

    with pytest.raises(MissingPOM):
        calibrate_flat("poncho", "front")


@pytest.mark.parametrize("garment", ("hoodie", "jacket") + UNHOODED)
def test_front_and_back_measure_the_same_garment(garment):
    """
    The two views are the same physical garment, so they must agree on its
    width in centimetres.

    Note they need NOT agree on px/cm: each flat was extracted from the tech
    pack at its own resolution, and the longsleeve's two views differ by 17%
    for exactly that reason while both measure 69.7cm across. Comparing px/cm
    would flag that correct pair as broken.

    This still catches the real failure it was written for: before the hem
    detection was fixed, the longsleeve front measured to a cuff instead of the
    hem, which threw its width off against the back.
    """
    widths = []
    for view in ("front", "back"):
        calib = calibrate_flat(garment, view)
        alpha = load_flat_alpha(garment, view)
        widest_px = max(
            np.flatnonzero(row).max() - np.flatnonzero(row).min() + 1
            for row in alpha
            if row.any()
        )
        widths.append(widest_px / calib.px_per_cm)

    assert widths[0] == pytest.approx(widths[1], rel=0.06)


@pytest.mark.parametrize("garment", ("hoodie", "jacket") + UNHOODED)
@pytest.mark.parametrize("view", ("front", "back"))
def test_centre_line_is_near_the_middle_of_the_drawing(garment, view):
    """
    Every flat is drawn with the body centred on its canvas, so the centreline
    belongs within a few percent of the middle. A loose band here hid a real
    bug: on the tees the last hem row is unevenly antialiased, splitting the
    body in two, and the wider half's midpoint sat 8% off centre.
    """
    calib = calibrate_flat(garment, view)
    alpha = load_flat_alpha(garment, view)
    width = alpha.shape[1]
    assert 0.45 * width < calib.center_x < 0.55 * width, f"{garment}/{view}"
