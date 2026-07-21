"""
Separate the garment from a base plate's background.

The signal is texture, not brightness. That is not the obvious choice, so it is
worth recording why every brightness-based approach was rejected:

  * The front plate is a white garment on a pure white background. There is
    almost no colour difference to threshold on.
  * The back plate is the opposite problem. Its garment is *brighter* than its
    background (250 against 229), so "darker than the background" is not merely
    imprecise there, it is inverted.
  * That background is not even constant. It ramps from 229 on the left to 243
    on the right, so a global threshold, or a per-row one, misreads a whole
    side of the frame as garment.
  * A soft drop shadow sits against the garment and is genuinely darker than
    the background, so no brightness rule separates it from the garment it
    touches.

Local contrast has none of those problems. Measured on the real plates,
background sits between 0.1 and 2.0 levels while fleece sits between 5.3
(front) and 9.9 (back), and the shadow is smooth, so it reads as background.
Sweeping the threshold confirms a wide stable band: from 3.0 to 5.0 both plates
return the same silhouette to within a few pixels, and only below 3.0 does the
back plate start to leak.
"""

import numpy as np
from PIL import Image, ImageFilter

# Local contrast, in 8-bit levels, above which a pixel counts as fabric.
# Centred in the stable band measured across both plates.
_CONTRAST_THRESHOLD = 4.0
# Radius for the local min/max used to measure contrast.
_CONTRAST_RADIUS = 2
# Blur-and-rethreshold radius that smooths the boundary. Fleece texture fades
# out near a flatly lit edge, so the raw threshold leaves the silhouette
# ragged, most visibly along the back plate's right sleeve.
_EDGE_SMOOTHING = 4.0
# Softens the final edge so composites do not alias.
_EDGE_FEATHER = 1.5


def _local_contrast(image):
    size = 2 * _CONTRAST_RADIUS + 1
    hi = np.asarray(image.filter(ImageFilter.MaxFilter(size)), dtype=np.float32)
    lo = np.asarray(image.filter(ImageFilter.MinFilter(size)), dtype=np.float32)
    return hi - lo


def _downscale(mask, factor):
    h = (mask.shape[0] // factor) * factor
    w = (mask.shape[1] // factor) * factor
    blocks = mask[:h, :w].reshape(h // factor, factor, w // factor, factor)
    return blocks.any(axis=(1, 3))


def _upscale(mask, factor, shape):
    grown = np.repeat(np.repeat(mask, factor, axis=0), factor, axis=1)
    out = np.zeros(shape, dtype=bool)
    out[:grown.shape[0], :grown.shape[1]] = grown
    # Restore the rows/columns the downscale truncated.
    if grown.shape[0] < shape[0]:
        out[grown.shape[0]:, :] = out[grown.shape[0] - 1, :]
    if grown.shape[1] < shape[1]:
        out[:, grown.shape[1]:] = out[:, grown.shape[1] - 1][:, None]
    return out


def _connectivity_scale(mask):
    """
    The flood fill below iterates until it converges, one dilation per pass.
    On a full 2048px plate the garment spans ~1800 rows, so that is ~1800
    passes over a 4-megapixel array: tens of seconds per plate. Running the
    connectivity at reduced scale cuts it to a couple of hundred passes over a
    tiny array, and costs nothing in quality because the result is intersected
    back with the full-resolution mask, so it only decides which blob survives,
    never where its edge sits.
    """
    return max(1, min(mask.shape) // 256)


def _largest_component(mask):
    """
    Keep only the biggest connected blob, dropping stray texture in the
    background and any speckle the thresholds let through.

    Implemented as iterative dilation of a seed rather than a full labelling
    pass, to avoid taking a scipy dependency for one call.
    """
    if not mask.any():
        return mask

    scale = _connectivity_scale(mask)
    if scale > 1:
        small = _largest_component(_downscale(mask, scale))
        return mask & _upscale(small, scale, mask.shape)

    # Seed from the densest row's midpoint, which is inside the garment body.
    seed_row = int(mask.sum(axis=1).argmax())
    cols = np.flatnonzero(mask[seed_row])
    seed = np.zeros_like(mask)
    seed[seed_row, int(cols.mean())] = True

    grown = seed
    while True:
        expanded = grown.copy()
        expanded[1:, :] |= grown[:-1, :]
        expanded[:-1, :] |= grown[1:, :]
        expanded[:, 1:] |= grown[:, :-1]
        expanded[:, :-1] |= grown[:, 1:]
        expanded &= mask
        if expanded.sum() == grown.sum():
            return expanded
        grown = expanded


def _fill_holes(mask):
    """
    Fill gaps the thresholds left inside the garment, such as a blown-out
    highlight on a fold reading as background.

    A pixel counts as interior when it has garment somewhere to its left AND
    right AND above AND below. That is a scanline test, so it costs four
    cumulative passes rather than the ~2000 dilation rounds a true flood fill
    would need on a 2048px plate.

    The known trade-off: a deep concave notch enclosed on all four sides, such
    as the gap between a sleeve and the torso, also fills. On these plates the
    sleeves hang against the body so that gap is negligible. If a future
    garment holds its arms clear of the body, this needs revisiting.
    """
    left = np.maximum.accumulate(mask, axis=1)
    right = np.maximum.accumulate(mask[:, ::-1], axis=1)[:, ::-1]
    top = np.maximum.accumulate(mask, axis=0)
    bottom = np.maximum.accumulate(mask[::-1, :], axis=0)[::-1, :]
    return mask | (left & right & top & bottom)


def extract_alpha(image):
    """
    Return the garment's alpha as float32 in [0, 1], shape (H, W).

    1.0 is fully garment, 0.0 fully background, with a feathered edge between.
    """
    grey_image = image.convert("L")

    textured = _local_contrast(grey_image) > _CONTRAST_THRESHOLD
    mask = _fill_holes(_largest_component(textured))

    # Blur and re-threshold to smooth the boundary, then blur again to feather
    # it. Doing both in one pass would trade a clean edge for a soft one.
    smoothed = Image.fromarray((mask * 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(_EDGE_SMOOTHING)
    )
    mask = np.asarray(smoothed, dtype=np.float32) > 127.5

    soft = Image.fromarray((mask * 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(_EDGE_FEATHER)
    )
    return (np.asarray(soft, dtype=np.float32) / 255.0).astype(np.float32)
