"""
Pixel-to-centimetre calibration for the mockup base plates.

The plates make no claim to dimensional truth, and cannot. Flux generated a
convincing hoodie, not a correctly proportioned one: four independent
references disagree with each other by 30% to 65%, and the garment runs about
30% long for its width. No single scale reconciles that.

It does not need to. The mockup never reaches the factory. The tech pack does,
and that is built from the flats, which are drawn to scale. What the mockup
owes is that a print *looks* the right size on the garment.

So the plate is anchored on the same feature the flat is, its hem band, using
the same measurement code. That makes a print's width consistent between the
two surfaces, which is the property that matters: what Alaa approves on the
flat is what the mockup shows. The vertical drop is approximate by
construction, because the plate is long for its width, and the tech pack
remains the authority for it.
"""

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from ..flats.calibrate_flats import _hem_band
from .cutout import extract_alpha

REPO = Path(__file__).resolve().parent.parent.parent
MOCKUP_DIR = REPO / "assets" / "mockup"
PLATES_JSON = MOCKUP_DIR / "plates.json"

# Where HSP sits above the hem, as a fraction of the garment's visible height.
# The plate's own proportions cannot give this: its body is long for its width,
# so deriving HSP from the front length the way the flats do would place it off
# the garment entirely. This is a presentational datum for the mockup only.
_HSP_ABOVE_HEM_FRACTION = 0.62


class MissingCalibration(Exception):
    """Raised when a plate cannot be calibrated. Never fall back to a guess."""


@dataclass(frozen=True)
class PlateCalibration:
    px_per_cm: float
    hsp_y: int
    center_x: int
    hem_y: int


def load_plate_spec(garment: str, tone: str, view: str) -> dict:
    """Flatten the garment-level and view-level keys into one spec dict."""
    try:
        registry = json.loads(PLATES_JSON.read_text())
    except FileNotFoundError as exc:
        raise MissingCalibration(f"no plate registry at {PLATES_JSON}") from exc

    try:
        garment_spec = registry[garment]
        view_spec = garment_spec[tone][view]
    except KeyError as exc:
        raise MissingCalibration(
            f"no plate recorded for {garment}/{tone}/{view} in {PLATES_JSON}"
        ) from exc

    merged = {k: v for k, v in garment_spec.items() if not isinstance(v, dict)}
    merged["panel"] = garment_spec["panel"]
    merged.update(view_spec)
    return merged


def calibrate_plate(garment: str, tone: str, view: str) -> PlateCalibration:
    spec = load_plate_spec(garment, tone, view)

    plate_path = MOCKUP_DIR / spec["file"]
    if not plate_path.exists():
        raise MissingCalibration(f"missing base plate: {plate_path}")

    alpha = extract_alpha(Image.open(plate_path).convert("RGB")) > 0.5
    hem_bottom, hem_width_px, hem_centre = _hem_band(alpha)

    px_per_cm = hem_width_px / spec["bottom_opening_cm"]

    rows = np.flatnonzero(alpha.any(axis=1))
    visible_height = hem_bottom - int(rows.min())
    hsp_y = int(round(hem_bottom - visible_height * _HSP_ABOVE_HEM_FRACTION))

    return PlateCalibration(
        px_per_cm=px_per_cm,
        hsp_y=hsp_y,
        center_x=int(round(hem_centre)),
        hem_y=hem_bottom,
    )
