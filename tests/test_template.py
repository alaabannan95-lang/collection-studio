import numpy as np
import pytest

from backend.mockup.calibrate import MissingCalibration
from backend.mockup.template import build_template, load_template


def test_unknown_plate_raises_rather_than_guessing():
    with pytest.raises(MissingCalibration):
        build_template("hoodie", "chartreuse", "front")


def test_builds_every_map_at_plate_resolution(real_front_plate):
    template = build_template("hoodie", "white", "front")
    size = (real_front_plate.height, real_front_plate.width)
    assert template.plate.size == real_front_plate.size
    assert template.alpha.shape == size
    assert template.shade.shape == size
    assert template.depth.shape == size
    assert template.panel.shape == size


def test_cache_round_trips(real_front_plate):
    first = load_template("hoodie", "white", "front")
    second = load_template("hoodie", "white", "front")
    assert np.allclose(first.alpha, second.alpha)
    assert np.allclose(first.shade, second.shade)
    assert first.calib == second.calib


def test_plates_are_never_resized(real_front_plate):
    assert build_template("hoodie", "white", "front").plate.size == (2048, 2048)
