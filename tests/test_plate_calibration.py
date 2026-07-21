"""
Calibration of the AI-generated mockup base plates.

Unlike the flats, these carry no promise of dimensional truth. Flux produced a
convincing hoodie, not a correctly proportioned one: measured against four
independent references it disagrees with itself by 30% to 65%, and it runs
roughly 30% long for its width. No single scale can fix that.

It does not need to. The mockup never reaches the factory; the tech pack does,
and that is built from the flats. What the mockup owes is that a print *looks*
the right size on the garment. So the plate is anchored on the same feature as
the flat, its hem band, which makes print widths consistent between the two
surfaces. Vertical drops are approximate by construction, and the tech pack
remains the authority for them.
"""

import numpy as np
import pytest
from PIL import Image

from backend.mockup.calibrate import MissingCalibration, calibrate_plate, load_plate_spec

HOODIE_BOTTOM_OPENING_CM = 48.0


def test_scale_comes_from_the_hem_band(real_front_plate):
    calib = calibrate_plate("hoodie", "white", "front")
    assert 10.0 < calib.px_per_cm < 30.0


def test_front_and_back_measure_the_same_garment(real_front_plate, real_back_plate):
    """
    Both plates show one garment, so its hem must measure the same on each.
    They are separate generations, so agreement here is a real check that the
    anchor found the same feature on both rather than a coincidence.
    """
    front = calibrate_plate("hoodie", "white", "front")
    back = calibrate_plate("hoodie", "white", "back")
    assert front.px_per_cm == pytest.approx(back.px_per_cm, rel=0.12)


def test_print_width_is_consistent_with_the_flat(real_back_plate):
    """
    The point of the whole exercise: a print sized in centimetres must cover
    the same fraction of the garment on the mockup as on the flat. If it does
    not, what Alaa approves on the flat is not what the mockup shows.
    """
    from backend.flats.calibrate_flats import calibrate_flat, load_flat_alpha

    plate = calibrate_plate("hoodie", "white", "back")
    flat = calibrate_flat("hoodie", "back")
    flat_alpha = load_flat_alpha("hoodie", "back")
    plate_alpha = np.asarray(Image.open(
        "assets/mockup/base/hoodie_white_back.png"
    ).convert("L"))

    # A 28cm print, as a fraction of each drawing's own width.
    plate_fraction = 28 * plate.px_per_cm / plate_alpha.shape[1]
    flat_fraction = 28 * flat.px_per_cm / flat_alpha.shape[1]
    assert plate_fraction == pytest.approx(flat_fraction, rel=0.25)


def test_centre_line_is_near_the_middle_of_the_plate(real_front_plate):
    calib = calibrate_plate("hoodie", "white", "front")
    assert 0.4 * 2048 < calib.center_x < 0.6 * 2048


def test_hsp_sits_above_the_hem(real_front_plate):
    calib = calibrate_plate("hoodie", "white", "front")
    assert 0 < calib.hsp_y < calib.hem_y


def test_unknown_plate_refuses(real_front_plate):
    with pytest.raises(MissingCalibration):
        calibrate_plate("hoodie", "chartreuse", "front")


def test_plate_spec_carries_the_printable_panel():
    spec = load_plate_spec("hoodie", "white", "back")
    assert spec["bottom_opening_cm"] == HOODIE_BOTTOM_OPENING_CM
    assert set(spec["panel"]) == {"top_cm", "bottom_cm", "half_width_cm"}
