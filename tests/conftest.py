"""
Shared fixtures.

Tests run against small synthetic plates by default so they stay fast and do
not depend on the real 2048px assets being present. The two synthetic plates
reproduce the exact failure modes the real plates have: a white garment on a
pure white background, and a garment on a soft grey gradient with a drop
shadow. Tests that need the real plates ask for them explicitly and skip when
they are absent.
"""

from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFilter

REPO = Path(__file__).resolve().parent.parent
PLATE_DIR = REPO / "assets" / "mockup" / "base"


def _garment_polygon(size):
    """A crude hoodie silhouette: body block plus two sleeves and a hood."""
    w = h = size
    return [
        (0.33 * w, 0.22 * h),   # left shoulder
        (0.42 * w, 0.14 * h),   # hood left
        (0.58 * w, 0.14 * h),   # hood right
        (0.67 * w, 0.22 * h),   # right shoulder
        (0.82 * w, 0.30 * h),   # right sleeve out
        (0.78 * w, 0.72 * h),   # right cuff
        (0.68 * w, 0.72 * h),
        (0.70 * w, 0.88 * h),   # right hem
        (0.30 * w, 0.88 * h),   # left hem
        (0.32 * w, 0.72 * h),
        (0.22 * w, 0.72 * h),   # left cuff
        (0.18 * w, 0.30 * h),   # left sleeve out
    ]


def _garment_mask(size):
    canvas = Image.new("L", (size, size), 0)
    ImageDraw.Draw(canvas).polygon(_garment_polygon(size), fill=255)
    return np.asarray(canvas, dtype=np.float32) / 255.0


def _add_fleece_texture(img, size, sigma=6.0):
    """
    Add fabric grain inside the garment only.

    This is the property the cutout actually keys on. Measured on the real
    plates, background sits at 0.1 to 2.0 levels of local contrast and the
    fleece at 5.3 (front) to 9.9 (back). A fixture with a perfectly flat
    garment would not reproduce that, and so would not test anything real.
    """
    rng = np.random.default_rng(20260721)
    arr = np.asarray(img, dtype=np.float32)
    noise = rng.normal(0.0, sigma, size=(size, size, 1))
    return Image.fromarray(
        np.clip(arr + noise * _garment_mask(size)[:, :, None], 0, 255).astype(np.uint8)
    )


@pytest.fixture
def white_on_white_plate():
    """Near-white textured garment on a pure white background, like the front plate."""
    size = 256
    img = Image.new("RGB", (size, size), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.polygon(_garment_polygon(size), fill=(250, 250, 250))
    return _add_fleece_texture(img.filter(ImageFilter.GaussianBlur(1)), size)


@pytest.fixture
def grey_gradient_plate():
    """
    Garment on a grey background with a horizontal gradient and a soft drop
    shadow, like the back plate.

    Both details are measured from the real plate: its background runs 229 on
    the left to 243 on the right, and the garment sits *brighter* than the
    background rather than darker. Any approach keying on "darker than the
    background" fails here, which is exactly what this fixture is for.
    """
    size = 256
    ramp = np.linspace(229, 243, size).reshape(1, size)
    bg = np.repeat(np.repeat(ramp, size, axis=0)[:, :, None], 3, axis=2)
    img = Image.fromarray(bg.astype(np.uint8))
    draw = ImageDraw.Draw(img)
    # Offset shadow first, then the garment on top.
    shadow = [(x + 10, y + 10) for x, y in _garment_polygon(size)]
    draw.polygon(shadow, fill=(205, 205, 205))
    draw.polygon(_garment_polygon(size), fill=(252, 252, 252))
    return _add_fleece_texture(img.filter(ImageFilter.GaussianBlur(2)), size)


@pytest.fixture
def real_front_plate():
    path = PLATE_DIR / "hoodie_white_front.png"
    if not path.exists():
        pytest.skip(f"missing plate: {path}")
    return Image.open(path).convert("RGB")


@pytest.fixture
def real_back_plate():
    path = PLATE_DIR / "hoodie_white_back.png"
    if not path.exists():
        pytest.skip(f"missing plate: {path}")
    return Image.open(path).convert("RGB")
