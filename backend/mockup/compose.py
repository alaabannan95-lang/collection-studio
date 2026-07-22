"""
Place artwork on a template and make it look printed on the garment.

Three passes, in order:

  1. Placement. Position and size the artwork in real centimetres, clipped to
     the printable panel. Placement follows the tech pack convention: the drop
     is measured from HSP to the print's HIGHEST point, and the horizontal
     offset from the centreline.
  2. Displacement. Push each printed pixel along the plate's fold geometry, so
     the artwork bends into creases instead of sitting on flat glass. This is
     the single strongest cue that the print is on the cloth.
  3. Material. Render the ink as either a screen print (matte, sunk into the
     weave, soft-edged) or embroidery (raised, relief-lit, with a contact
     shadow). The downstream try-on tool needs this distinction to carry onto
     the model.

Then the print takes the plate's own lighting and is composited down.
"""

from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageFilter

from .template import Template

# How far, in pixels, a unit of depth slides the print. Fabric folds move a
# print by a few millimetres, not centimetres, so this stays small.
_DISPLACE_STRENGTH = 6.0

# Screen print: ink opacity, edge softness, and how much fabric weave shows.
_SCREEN_OPACITY = 0.92
_SCREEN_EDGE_BLUR = 1.0
_SCREEN_WEAVE = 0.08

# Embroidery: raised relief. No contact shadow: Alaa wants the logo clean of
# any cast shadow on both methods, so the raised look comes from the relief
# lighting on the thread alone, never from darkening the fabric beside it.
_EMB_RELIEF = 0.45
_EMB_DILATE = 1


@dataclass(frozen=True)
class Placement:
    width_cm: float
    drop_cm: float
    offset_cm: float = 0.0


def recolour(plate, alpha, hex_colour):
    """
    Tint the garment to a colourway while keeping every fold and shadow.

    The plates are white, so without this a red hoodie renders white and the
    mockup ignores the colourway entirely.

    Works the way the flats do, in spirit: take the plate's own brightness as a
    multiplier around its mid-tone and apply the target colour through it.
    Where the fabric is in shadow the multiplier is below 1 and the colour goes
    darker; on a highlight it rises above 1 and the colour lifts toward white.
    That keeps the photograph's lighting instead of flooding it with flat paint.
    """
    if not hex_colour:
        return plate

    hex_colour = hex_colour.lstrip("#")
    target = np.array(
        [int(hex_colour[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32
    )

    rgb = np.asarray(plate.convert("RGB"), dtype=np.float32)
    luma = rgb.mean(axis=2)

    garment = alpha > 0.5
    mid = float(np.median(luma[garment])) if garment.any() else 255.0
    ratio = (luma / max(mid, 1.0))[:, :, None]

    tinted = np.clip(target[None, None, :] * ratio, 0, 255)
    a = np.clip(alpha, 0.0, 1.0)[:, :, None]
    return Image.fromarray(
        np.clip(rgb * (1.0 - a) + tinted * a, 0, 255).astype(np.uint8)
    )


def place(template, artwork, placement):
    """Return the artwork's (left, top, right, bottom) box in plate pixels."""
    calib = template.calib
    width_px = int(round(placement.width_cm * calib.px_per_cm))
    height_px = max(1, int(round(width_px * artwork.height / artwork.width)))

    centre_x = calib.center_x + int(round(placement.offset_cm * calib.px_per_cm))
    left = centre_x - width_px // 2
    top = calib.hsp_y + int(round(placement.drop_cm * calib.px_per_cm))
    return left, top, left + width_px, top + height_px


def _rasterise(template, artwork, placement):
    """The artwork's ink and alpha at plate resolution, clipped to the panel."""
    left, top, right, bottom = place(template, artwork, placement)
    layer = Image.new("RGBA", template.plate.size, (0, 0, 0, 0))
    scaled = artwork.convert("RGBA").resize((right - left, bottom - top), Image.LANCZOS)
    layer.paste(scaled, (left, top))

    rgba = np.asarray(layer, dtype=np.float32)
    ink = rgba[:, :, :3]
    alpha = (rgba[:, :, 3] / 255.0) * template.panel
    return ink, alpha


def _displace(ink, alpha, depth):
    """
    Slide ink and alpha along the depth gradient, so the print rides the folds.

    The gradient points across a crease, which is the direction fabric pushes a
    print, so sampling each output pixel from a source offset by that gradient
    warps the artwork the way cloth would.
    """
    gy, gx = np.gradient(depth)
    rows, cols = depth.shape
    yy, xx = np.mgrid[0:rows, 0:cols]
    src_x = np.clip(xx + gx * _DISPLACE_STRENGTH, 0, cols - 1).astype(np.intp)
    src_y = np.clip(yy + gy * _DISPLACE_STRENGTH, 0, rows - 1).astype(np.intp)
    return ink[src_y, src_x], alpha[src_y, src_x]


# Each material returns (ink, alpha, shadow), where shadow is a per-pixel
# darkening applied to the plate beneath the print, or None.


def _screen_print(ink, alpha, template):
    """Matte ink sunk into the weave: soft edges, fabric texture showing through."""
    soft = np.asarray(
        Image.fromarray((alpha * 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(_SCREEN_EDGE_BLUR)
        ),
        dtype=np.float32,
    ) / 255.0

    plate = np.asarray(template.plate.convert("RGB"), dtype=np.float32)
    plate_detail = plate - float(plate.mean())
    inked = np.clip(ink + plate_detail * _SCREEN_WEAVE, 0, 255)
    return inked, soft * _SCREEN_OPACITY, None


def _embroidery(ink, alpha, template):
    """Raised thread: relief lighting from the alpha. No cast shadow."""
    dilated = np.asarray(
        Image.fromarray((alpha * 255).astype(np.uint8)).filter(
            ImageFilter.MaxFilter(2 * _EMB_DILATE + 1)
        ),
        dtype=np.float32,
    ) / 255.0

    # Relief: light the near edge of the stitching, darken the far edge, from
    # the height step across the thread boundary. This shading lives entirely on
    # the thread, so it reads as raised without casting onto the fabric.
    height = np.asarray(
        Image.fromarray((dilated * 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(2.0)
        ),
        dtype=np.float32,
    ) / 255.0
    gy, gx = np.gradient(height)
    relief = np.clip((gx + gy) * _EMB_RELIEF * 255.0, -80, 80)
    lit = np.clip(ink + relief[:, :, None], 0, 255)

    return lit, dilated, None


_METHODS = {"screen": _screen_print, "embroidery": _embroidery}


def compose(template, artwork, placement, method="screen"):
    """Composite artwork onto the plate, warped, materialised, and lit by it."""
    if method not in _METHODS:
        raise ValueError(f"unknown print method: {method!r}")

    ink, alpha = _rasterise(template, artwork, placement)
    ink, alpha = _displace(ink, alpha, template.depth)
    ink, alpha, shadow = _METHODS[method](ink, alpha, template)

    # The print sits in the plate's own light.
    ink = np.clip(ink * template.shade[:, :, None], 0, 255)

    plate = np.asarray(template.plate.convert("RGB"), dtype=np.float32)
    if shadow is not None:
        plate = plate * (1.0 - shadow[:, :, None])

    a = alpha[:, :, None]
    blended = plate * (1.0 - a) + ink * a
    out = np.dstack([blended, template.alpha * 255.0])
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
