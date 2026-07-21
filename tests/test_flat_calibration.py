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


def test_uncalibrated_garment_refuses_rather_than_guessing():
    """
    A plausible-looking wrong scale is worse than no answer, because it reaches
    the factory as a printed centimetre figure.
    """
    from backend.flats.calibrate_flats import MissingPOM

    with pytest.raises(MissingPOM):
        calibrate_flat("crewneck", "front")
