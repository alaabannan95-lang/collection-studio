import numpy as np

from backend.mockup.cutout import extract_alpha


def _coverage(alpha):
    return float((alpha > 0.5).mean())


def test_returns_float_alpha_in_unit_range(white_on_white_plate):
    alpha = extract_alpha(white_on_white_plate)
    assert alpha.dtype == np.float32
    assert alpha.shape == (256, 256)
    assert alpha.min() >= 0.0
    assert alpha.max() <= 1.0


def test_finds_white_garment_on_white_background(white_on_white_plate):
    alpha = extract_alpha(white_on_white_plate)
    # The synthetic silhouette covers roughly a third of the frame.
    assert 0.2 < _coverage(alpha) < 0.5


def test_corners_are_background_on_white_plate(white_on_white_plate):
    alpha = extract_alpha(white_on_white_plate)
    for corner in (alpha[:20, :20], alpha[:20, -20:], alpha[-20:, :20], alpha[-20:, -20:]):
        assert corner.max() < 0.5


def test_does_not_leak_into_drop_shadow(grey_gradient_plate):
    """
    The real back plate leaks to ~64% coverage under a naive global threshold,
    because the drop shadow is darker than the background.
    """
    alpha = extract_alpha(grey_gradient_plate)
    assert 0.2 < _coverage(alpha) < 0.5


def test_garment_interior_has_no_holes(grey_gradient_plate):
    alpha = extract_alpha(grey_gradient_plate)
    # Dead centre of the frame is inside the garment body.
    assert alpha[128, 128] > 0.9


def test_real_front_plate_coverage(real_front_plate):
    alpha = extract_alpha(real_front_plate)
    assert 0.25 < _coverage(alpha) < 0.60


def test_real_back_plate_coverage(real_back_plate):
    alpha = extract_alpha(real_back_plate)
    assert 0.25 < _coverage(alpha) < 0.60
