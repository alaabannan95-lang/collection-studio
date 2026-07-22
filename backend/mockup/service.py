"""
Turn a Studio design payload into a mockup image.

Bridges the app's own vocabulary to the engine's. The app already sends the
tech pack every print's size and position in centimetres, so a mockup needs no
new UI state: the same payload drives both.

Only garments with a base plate can be mocked up, which today means the hoodie
in white. Anything else raises, rather than silently rendering the wrong
garment.
"""

import base64
import io

from PIL import Image

from .calibrate import MissingCalibration
from .compose import Placement, compose, recolour
from .template import load_template

# Which colourway maps to which plate tone. Only the white plate exists so far,
# so every colourway tints from it. Once grey and navy plates are generated,
# dark colourways should map to those instead: tinting a white plate all the
# way to navy loses the shadow depth a genuinely dark garment has.
_TONE_BY_COLOUR = {}
_DEFAULT_TONE = "white"


def _decode_artwork(src):
    """Read a print layer's `src`, which the app sends as a data URL."""
    if not src or "," not in src:
        raise ValueError("print layer has no usable image data")
    return Image.open(io.BytesIO(base64.b64decode(src.split(",", 1)[1]))).convert("RGBA")


def tone_for(colour_hex):
    return _TONE_BY_COLOUR.get((colour_hex or "").lower(), _DEFAULT_TONE)


def render_payload(payload, view=None):
    """
    Render the design in `payload` and return the mockup as PNG bytes.

    `view` defaults to whichever side the payload's prints are on, so the
    button renders what the user is looking at.
    """
    garment = payload["garment"]["assetKey"]
    prints = payload.get("prints") or []

    if view is None:
        view = prints[0]["view"] if prints else "front"

    colour = payload.get("color")
    tone = tone_for(colour)
    try:
        template = load_template(garment, tone, view)
    except (MissingCalibration, FileNotFoundError) as exc:
        raise MissingCalibration(
            f"no mockup plate for {garment} in {tone}. "
            "Base plates exist for the hoodie so far."
        ) from exc

    # Tint the blank to the chosen colourway before anything is printed on it,
    # so the print lands on the garment's real colour rather than on white.
    template = _with_plate(template, recolour(template.plate, template.alpha, colour))

    rendered = None
    for layer in prints:
        if layer.get("view") != view:
            continue
        placement = Placement(
            width_cm=float(layer["widthCm"]),
            drop_cm=float(layer["belowCollarCm"]),
            offset_cm=float(layer.get("fromCenterCm", 0.0)),
        )
        method = "embroidery" if layer.get("method") == "embroidery" else "screen"
        artwork = _decode_artwork(layer.get("src"))

        # Each layer composites onto the result of the last, so a design with
        # several prints stacks the way it does on the garment.
        if rendered is not None:
            template = _with_plate(template, rendered.convert("RGB"))
        rendered = compose(template, artwork, placement, method=method)

    if rendered is None:
        rendered = _plate_only(template)

    out = io.BytesIO()
    rendered.save(out, format="PNG")
    return out.getvalue()


def _with_plate(template, plate):
    """A copy of the template whose plate is an already-composited image."""
    from dataclasses import replace

    return replace(template, plate=plate)


def _plate_only(template):
    """The blank garment, cut out, for a design with no prints on this side."""
    import numpy as np

    plate = np.asarray(template.plate.convert("RGB"), dtype=np.float32)
    out = np.dstack([plate, template.alpha * 255.0])
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
