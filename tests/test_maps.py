import numpy as np
from PIL import Image

from backend.mockup.calibrate import PlateCalibration
from backend.mockup.maps import build_depth, build_panel_mask, build_shade


def _gradient_plate(size=128):
    ramp = np.linspace(180, 255, size).reshape(1, size)
    arr = np.repeat(np.repeat(ramp, size, axis=0)[:, :, None], 3, axis=2)
    return Image.fromarray(arr.astype(np.uint8))


def test_shade_is_near_one_on_average_over_the_garment():
    shade = build_shade(_gradient_plate(), np.ones((128, 128), dtype=np.float32))
    assert shade.dtype == np.float32
    assert 0.95 < float(shade.mean()) < 1.05


def test_shade_is_darker_where_the_plate_is_darker():
    shade = build_shade(_gradient_plate(), np.ones((128, 128), dtype=np.float32))
    assert shade[64, 5] < shade[64, 120]


def test_depth_ignores_broad_shading_and_keeps_only_local_detail():
    """
    A smooth ramp is shading, not folds. Depth must come out flat on it, or a
    print would warp along the whole garment instead of across its creases.

    The alpha inset mirrors reality: a blur has nothing to average against past
    the image border, so it leaves a rim of false detail there. On a real plate
    the garment never reaches the edge, so that rim is always outside it.
    """
    alpha = np.zeros((128, 128), dtype=np.float32)
    alpha[16:112, 16:112] = 1.0
    depth = build_depth(_gradient_plate(), alpha)
    assert float(np.abs(depth).max()) < 0.15


def test_depth_responds_to_a_crease():
    arr = np.full((128, 128, 3), 220, dtype=np.uint8)
    arr[:, 62:66] = 150  # a dark vertical crease
    alpha = np.zeros((128, 128), dtype=np.float32)
    alpha[16:112, 16:112] = 1.0
    depth = build_depth(Image.fromarray(arr), alpha)
    assert float(np.abs(depth[20:100, 60:68]).max()) > 0.3


def test_panel_mask_sits_inside_the_garment():
    alpha = np.zeros((400, 400), dtype=np.float32)
    alpha[50:350, 100:300] = 1.0
    calib = PlateCalibration(px_per_cm=4.0, hsp_y=50, center_x=200, hem_y=350)
    panel = {"top_cm": 5.0, "bottom_cm": 40.0, "half_width_cm": 20.0}
    mask = build_panel_mask(alpha, calib, panel)
    assert mask[40, 200] == 0.0    # above the panel top
    assert mask[200, 200] == 1.0   # mid panel
    assert mask[200, 20] == 0.0    # outside the garment


def test_panel_mask_respects_the_centimetre_bounds():
    alpha = np.ones((400, 400), dtype=np.float32)
    calib = PlateCalibration(px_per_cm=4.0, hsp_y=50, center_x=200, hem_y=350)
    panel = {"top_cm": 5.0, "bottom_cm": 40.0, "half_width_cm": 20.0}
    mask = build_panel_mask(alpha, calib, panel)
    rows = np.flatnonzero(mask.any(axis=1))
    cols = np.flatnonzero(mask.any(axis=0))
    assert rows.min() == 70    # hsp_y 50 + 5cm * 4px
    assert rows.max() == 209   # hsp_y 50 + 40cm * 4px, exclusive
    assert cols.min() == 120   # center 200 - 20cm * 4px
    assert cols.max() == 279


def test_panel_is_a_meaningful_fraction_of_the_real_garment(real_back_plate):
    """
    Guards the panel bounds in plates.json. Too small and prints cannot be
    placed where they belong; too large and they run onto the rib or the hood.
    """
    from backend.mockup.calibrate import calibrate_plate, load_plate_spec
    from backend.mockup.cutout import extract_alpha

    alpha = extract_alpha(real_back_plate)
    calib = calibrate_plate("hoodie", "white", "back")
    spec = load_plate_spec("hoodie", "white", "back")
    panel = build_panel_mask(alpha, calib, spec["panel"])

    garment_px = float((alpha > 0.5).sum())
    assert 0.10 < float((panel > 0.5).sum()) / garment_px < 0.60
