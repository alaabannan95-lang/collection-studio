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


from PIL import Image

from ..flats.calibrate_flats import _hem_band
from .cutout import extract_alpha

REPO = Path(__file__).resolve().parent.parent.parent
MOCKUP_DIR = REPO / "assets" / "mockup"
PLATES_JSON = MOCKUP_DIR / "plates.json"

# HSP is recorded per plate in plates.json rather than derived.
#
# The flats derive it from the garment's front length, which works because they
# are drawn to scale. A plate is not: it runs about 30% long for its width, so
# stepping 66cm up from the hem lands well below the actual shoulder. A first
# attempt used a fixed fraction of the garment's height instead and put HSP at
# mid-chest, which dropped the printable panel onto the kangaroo pocket.
#
# The shoulder is plainly visible on each plate as the row where the silhouette
# widens into the sleeves, so it is read off once and written down.


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
    merged.update(view_spec)

    for required in ("hsp_y", "panel"):
        if required not in merged:
            raise MissingCalibration(
                f"{garment}/{tone}/{view} has no '{required}'; "
                "measure it off the plate and record it in plates.json"
            )
    return merged


def calibrate_plate(garment: str, tone: str, view: str) -> PlateCalibration:
    spec = load_plate_spec(garment, tone, view)

    plate_path = MOCKUP_DIR / spec["file"]
    if not plate_path.exists():
        raise MissingCalibration(f"missing base plate: {plate_path}")

    alpha = extract_alpha(Image.open(plate_path).convert("RGB")) > 0.5
    hem_bottom, hem_width_px, hem_centre = _hem_band(alpha)

    return PlateCalibration(
        px_per_cm=hem_width_px / spec["bottom_opening_cm"],
        hsp_y=int(spec["hsp_y"]),
        center_x=int(round(hem_centre)),
        hem_y=hem_bottom,
    )
