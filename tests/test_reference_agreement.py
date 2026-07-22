"""
The flat and the plate must agree on where "N cm below the collar" is.

Alaa designs on the flat and judges the mockup, so if the two disagree the tool
fails at its job no matter how defensible either number is on its own. They
disagreed badly: HSP on the plates was recorded as "the row where the
silhouette widens into the sleeves", which is not the anatomical point the
flats use, and on the back it landed 14.6cm too high, pinning prints against
the hood.

The check uses the neckline as a shared landmark, because it is the one feature
visible and unambiguous on both surfaces: the V where the hood meets the body
on the front, and the hood's lower edge on the back. Whatever each surface
calls HSP, it must sit the same distance below that landmark.

Note this deliberately does NOT compare positions as a fraction of the body.
The plate runs about 30% long for its width, so those fractions cannot match,
and demanding it would be chasing a property the plate cannot have.
"""

import numpy as np
import pytest
from PIL import Image

from backend.flats.calibrate_flats import calibrate_flat
from backend.mockup.calibrate import calibrate_plate

TOLERANCE_CM = 1.0


def _flat_neckline(view):
    """Lowest neck ink on the flat's centreline: the V point, or the hood's edge."""
    calib = calibrate_flat("hoodie", view)
    grey = np.asarray(Image.open(f"assets/hoodie_{view}.png").convert("L"), dtype=float)
    column = grey[:, calib.center_x - 4:calib.center_x + 4].min(axis=1)
    ink = np.flatnonzero(column < 128)
    ink = ink[(ink > 60) & (ink < 400)]
    return calib, int(ink.max())


def _plate_neckline(view):
    """
    The same landmark on the plate, found as the brightness step where the
    hood's shadow gives way to lit cloth on the centreline.
    """
    calib = calibrate_plate("hoodie", "white", view)
    grey = np.asarray(
        Image.open(f"assets/mockup/base/hoodie_white_{view}.png").convert("L"),
        dtype=float,
    )
    column = grey[:, calib.center_x - 6:calib.center_x + 6].mean(axis=1)
    window = range(300, 500) if view == "front" else range(520, 700)
    # The darkest row in the window is the seam shadow under the hood.
    darkest = min(window, key=lambda y: column[y])
    return calib, darkest


@pytest.mark.parametrize("view", ("front", "back"))
def test_flat_and_plate_agree_on_where_the_collar_is(view, real_front_plate):
    flat, flat_neck = _flat_neckline(view)
    plate, plate_neck = _plate_neckline(view)

    flat_offset_cm = (flat.hsp_y - flat_neck) / flat.px_per_cm
    plate_offset_cm = (plate.hsp_y - plate_neck) / plate.px_per_cm

    assert plate_offset_cm == pytest.approx(flat_offset_cm, abs=TOLERANCE_CM), (
        f"{view}: the collar reference sits {flat_offset_cm:.1f}cm below the "
        f"neckline on the flat but {plate_offset_cm:.1f}cm on the plate, so the "
        f"same placement lands {abs(plate_offset_cm - flat_offset_cm):.1f}cm "
        "apart on the two surfaces"
    )
