"""
Maps derived from a base plate. No AI: all three fall out of the plate's own
luminance plus its calibration.

  shade  the plate's broad lighting, so a print picks up the same key light and
         shadow the fabric does
  depth  fold geometry with the broad lighting removed, so the artwork can be
         warped into creases rather than along the whole garment
  mask   the printable panel, so artwork cannot run over the hem rib, the hood
         seam or the pocket
"""

import numpy as np
from PIL import Image, ImageFilter

# Separates broad lighting from local fold detail, as a fraction of the plate's
# smaller side. Expressed relative rather than absolute so the maps behave the
# same on a 2048px plate and on a small test fixture: 0.0195 is the 40px that
# was tuned on the real plates.
_SHADING_SIGMA_FRACTION = 0.0195


# Fold contrast, in 8-bit levels, that maps to full depth.
_DEPTH_RANGE = 24.0


def _shading_sigma(image):
    return max(1.0, _SHADING_SIGMA_FRACTION * min(image.size))


def build_shade(image, alpha):
    """
    Broad lighting normalised so the garment's median reads as 1.0.

    Multiplying a print by this makes it sit in the plate's light instead of
    looking pasted on flat.
    """
    blurred = np.asarray(
        image.convert("L").filter(ImageFilter.GaussianBlur(_shading_sigma(image))),
        dtype=np.float32,
    )

    garment = alpha > 0.5
    reference = float(np.median(blurred[garment])) if garment.any() else 255.0
    return (blurred / max(reference, 1.0)).astype(np.float32)


def build_depth(image, alpha):
    """
    Fold geometry in [-1, 1]: negative in creases, positive on ridges.

    High-passing removes the broad shading, which is what stops a print from
    bending along the garment's overall form instead of across its folds.
    """
    grey = np.asarray(image.convert("L"), dtype=np.float32)
    blurred = np.asarray(
        image.convert("L").filter(ImageFilter.GaussianBlur(_shading_sigma(image))),
        dtype=np.float32,
    )
    detail = (grey - blurred) / _DEPTH_RANGE
    return (np.clip(detail, -1.0, 1.0) * (alpha > 0.5)).astype(np.float32)


def build_panel_mask(alpha, calib, panel):
    """
    The printable region: a centimetre-defined box, intersected with the
    garment itself so it can never spill onto the background.
    """
    height, width = alpha.shape
    mask = np.zeros((height, width), dtype=np.float32)

    top = calib.hsp_y + int(round(panel["top_cm"] * calib.px_per_cm))
    bottom = calib.hsp_y + int(round(panel["bottom_cm"] * calib.px_per_cm))
    half = int(round(panel["half_width_cm"] * calib.px_per_cm))

    top, bottom = max(top, 0), min(bottom, height)
    left, right = max(calib.center_x - half, 0), min(calib.center_x + half, width)
    if top >= bottom or left >= right:
        return mask

    mask[top:bottom, left:right] = 1.0
    return (mask * (alpha > 0.5)).astype(np.float32)
