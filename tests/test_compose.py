import numpy as np
import pytest
from PIL import Image, ImageFilter

from backend.mockup.calibrate import PlateCalibration
from backend.mockup.compose import Placement, _rasterise, compose, place
from backend.mockup.template import Template


@pytest.fixture
def flat_template():
    """A featureless white template with round numbers: 10 px per cm."""
    size = 800
    plate = Image.new("RGB", (size, size), (255, 255, 255))
    alpha = np.zeros((size, size), dtype=np.float32)
    alpha[100:700, 150:650] = 1.0
    panel = np.zeros((size, size), dtype=np.float32)
    panel[150:650, 200:600] = 1.0
    return Template(
        plate=plate,
        alpha=alpha,
        shade=np.ones((size, size), dtype=np.float32),
        depth=np.zeros((size, size), dtype=np.float32),
        panel=panel,
        calib=PlateCalibration(px_per_cm=10.0, hsp_y=100, center_x=400, hem_y=700),
    )


def _artwork(w=40, h=20, colour=(200, 0, 0, 255)):
    return Image.new("RGBA", (w, h), colour)


def test_a_12cm_print_measures_12cm(flat_template):
    left, _, right, _ = place(flat_template, _artwork(), Placement(width_cm=12.0, drop_cm=14.0))
    assert (right - left) / flat_template.calib.px_per_cm == pytest.approx(12.0, abs=0.05)


def test_drop_is_measured_to_the_top_of_the_print(flat_template):
    _, top, _, _ = place(flat_template, _artwork(), Placement(width_cm=12.0, drop_cm=14.0))
    assert top - flat_template.calib.hsp_y == pytest.approx(140, abs=1)


def test_artwork_aspect_ratio_is_preserved(flat_template):
    left, top, right, bottom = place(
        flat_template, _artwork(w=40, h=20), Placement(width_cm=12.0, drop_cm=14.0)
    )
    assert (right - left) / (bottom - top) == pytest.approx(2.0, abs=0.05)


def test_horizontal_offset_shifts_from_the_centreline(flat_template):
    left, _, right, _ = place(
        flat_template, _artwork(), Placement(width_cm=10.0, drop_cm=14.0, offset_cm=5.0)
    )
    assert (left + right) / 2 == pytest.approx(flat_template.calib.center_x + 50, abs=1)


def test_centred_by_default(flat_template):
    left, _, right, _ = place(flat_template, _artwork(), Placement(width_cm=10.0, drop_cm=14.0))
    assert (left + right) / 2 == pytest.approx(flat_template.calib.center_x, abs=1)


def test_composite_keeps_plate_resolution(flat_template):
    out = compose(flat_template, _artwork(), Placement(width_cm=12.0, drop_cm=14.0))
    assert out.size == flat_template.plate.size
    assert out.mode == "RGBA"


def test_artwork_is_clipped_to_the_printable_panel(flat_template):
    """A print pushed past the panel's bottom edge must be cut, not overflow."""
    out = compose(flat_template, _artwork(), Placement(width_cm=30.0, drop_cm=54.0))
    painted = np.asarray(out.convert("RGB"), dtype=np.float32)
    assert painted[660:, :, 0].min() > 240  # still white below the panel


def test_print_lands_where_placement_says(flat_template):
    out = compose(flat_template, _artwork(), Placement(width_cm=12.0, drop_cm=14.0))
    red = np.asarray(out.convert("RGB"), dtype=np.float32)[:, :, 0] < 240
    rows = np.flatnonzero(red.any(axis=1))
    assert rows.min() == pytest.approx(240, abs=3)  # hsp_y 100 + 14cm * 10px


def test_shade_darkens_the_print(flat_template):
    dark = Template(**{**flat_template.__dict__, "shade": flat_template.shade * 0.5})
    grey = _artwork(colour=(200, 200, 200, 255))
    lit = compose(flat_template, grey, Placement(12.0, 14.0), method="screen")
    shaded = compose(dark, grey, Placement(12.0, 14.0), method="screen")
    lit_px = np.asarray(lit.convert("RGB"), dtype=np.float32)[250, 400].mean()
    shaded_px = np.asarray(shaded.convert("RGB"), dtype=np.float32)[250, 400].mean()
    assert shaded_px < lit_px


def test_depth_displaces_the_print(flat_template):
    """
    A print over a fold should not land at the same pixels it would on flat
    fabric. With a strong depth gradient present, some of the printed area
    shifts.
    """
    # Rolling folds, like real fold geometry: a wave whose local gradient is
    # large enough to shift the print by a pixel or two. A single step edge, or
    # a gentle full-frame ramp, has a near-zero gradient and would displace
    # almost nothing, which would test the fixture rather than the code.
    yy, xx = np.mgrid[0:800, 0:800]
    depth = np.sin(xx / 15.0).astype(np.float32)
    warped_t = Template(**{**flat_template.__dict__, "depth": depth})

    flat = compose(flat_template, _artwork(w=200, h=200), Placement(20.0, 14.0), method="screen")
    warped = compose(warped_t, _artwork(w=200, h=200), Placement(20.0, 14.0), method="screen")

    assert not np.allclose(
        np.asarray(flat.convert("RGB")), np.asarray(warped.convert("RGB"))
    )


def test_embroidery_and_screen_print_differ(flat_template):
    """
    The two methods must produce visibly different output, or the mockup does
    not carry the distinction the downstream try-on tool needs.
    """
    art = _artwork(w=120, h=120, colour=(30, 30, 30, 255))
    emb = compose(flat_template, art, Placement(12.0, 14.0), method="embroidery")
    scr = compose(flat_template, art, Placement(12.0, 14.0), method="screen")
    assert not np.allclose(
        np.asarray(emb.convert("RGB")), np.asarray(scr.convert("RGB")), atol=8
    )


def test_embroidery_casts_no_shadow_beyond_the_thread(flat_template):
    """
    Embroidery must not darken the plate beyond the thread itself. The thread
    body is a few pixels wider than the raster ink (it is dilated), so allow a
    small margin around the ink and require everything past it to stay at the
    plate's white.
    """
    art = _artwork(w=120, h=120, colour=(30, 30, 30, 255))
    ink = _rasterise(flat_template, art, Placement(12.0, 14.0))[1] > 0.01
    # Only a 1px margin, the width of the raised thread body itself. A cast
    # shadow sits further out than that, so this margin does not hide it.
    near_ink = np.asarray(
        Image.fromarray((ink * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    ) > 0

    emb = np.asarray(
        compose(flat_template, art, Placement(12.0, 14.0), method="embroidery").convert("L"),
        dtype=np.float32,
    )
    assert emb[~near_ink].min() > 254


def test_transparent_artwork_only_prints_its_opaque_pixels(flat_template):
    art = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    art.paste((0, 0, 0, 255), (40, 40, 60, 60))  # a small opaque square
    out = compose(flat_template, art, Placement(20.0, 14.0), method="screen")
    dark = np.asarray(out.convert("L"), dtype=np.float32) < 128
    # Far less than half the print box is inked.
    assert dark.mean() < 0.1


def test_recolour_tints_the_garment_but_keeps_its_folds():
    """
    A red hoodie must render red. The plate is white, so the body colour has to
    be applied to it; without this the mockup ignores the colourway entirely
    and every garment comes back white.
    """
    from backend.mockup.compose import recolour

    plate = Image.new("RGB", (64, 64), (240, 240, 240))
    plate.putpixel((10, 10), (180, 180, 180))  # a fold, darker than its surroundings
    alpha = np.ones((64, 64), dtype=np.float32)

    tinted = np.asarray(recolour(plate, alpha, "#B00020"), dtype=np.float32)

    # Reads red, not white.
    assert tinted[32, 32, 0] > tinted[32, 32, 1] + 60
    assert tinted[32, 32, 0] > tinted[32, 32, 2] + 60
    # The fold survives as a darker patch.
    assert tinted[10, 10].mean() < tinted[32, 32].mean() - 10


def test_recolour_leaves_the_background_alone():
    from backend.mockup.compose import recolour

    plate = Image.new("RGB", (64, 64), (255, 255, 255))
    alpha = np.zeros((64, 64), dtype=np.float32)
    alpha[20:40, 20:40] = 1.0

    tinted = np.asarray(recolour(plate, alpha, "#B00020"), dtype=np.float32)
    assert tinted[2, 2].min() > 250      # background untouched
    assert tinted[30, 30, 0] > tinted[30, 30, 1] + 60  # garment tinted
