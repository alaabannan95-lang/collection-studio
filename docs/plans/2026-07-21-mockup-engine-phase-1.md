# Mockup Engine Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the locked white hoodie base plates into calibrated templates and composite artwork onto them at exact centimetre placement, proving the measurement chain before any realism work is built on top.

**Architecture:** Three pure modules under `backend/mockup/` (cutout, calibration, maps), a build script that derives and caches per-plate maps once, and a compositor that places artwork using the same `pxPerCm` / `hspY` / `centerX` contract the flats already use. No displacement and no material rendering in this phase; those are phases 2 and 3.

**Tech Stack:** Python 3, numpy, Pillow. pytest for tests. No OpenCV and no scipy: everything here is expressible with numpy and Pillow, and the backend deploys to a free Render instance where image size matters.

## Global Constraints

- Output plates and maps are **2048x2048**. Never resize a plate.
- Placement is measured **from HSP (collar) to the highest point of the print**, never to its centre; horizontal offset is from the garment centreline. This matches `soap_techpack_placement` and what the factory receives.
- A render must **refuse rather than guess**. Missing calibration or a missing plate raises; it never falls back to an assumed scale. A plausible-looking wrong placement is worse than no render because it reaches production.
- These plates are **technical reference photos**, not brand imagery. No warm light, no styling, no brand palette applied to the plate itself.
- New files go in the folder matching their type. Nothing loose in the repo root.
- The two locked plates are `assets/mockup/base/hoodie_white_front.png` and `assets/mockup/base/hoodie_white_back.png`. Treat them as read-only inputs.

---

### Task 1: Alpha cutout

Separates the garment from the plate background. This is the foundation for every later measurement, so it gets the first test cycle.

The two plates fail in different ways, and both are covered here. The front's background is pure white (255) behind a white garment, so a colour threshold alone finds nothing reliable. The back's background is light grey (~225) with a soft gradient and drop shadow, so a single global threshold leaks into the shadow and returns roughly 64% of the frame instead of the garment.

**Files:**
- Create: `Collection studio/backend/mockup/__init__.py`
- Create: `Collection studio/backend/mockup/cutout.py`
- Create: `Collection studio/backend/requirements-dev.txt`
- Create: `Collection studio/tests/__init__.py`
- Create: `Collection studio/tests/conftest.py`
- Create: `Collection studio/tests/test_cutout.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `extract_alpha(image: PIL.Image.Image) -> numpy.ndarray` returning float32 of shape `(H, W)` with values in `[0.0, 1.0]`, where 1.0 is fully garment.

- [ ] **Step 1: Add the dev dependency file**

Create `Collection studio/backend/requirements-dev.txt`:

```
-r requirements.txt
pytest==8.3.4
```

Install it:

```bash
cd "Collection studio" && python3 -m pip install -r backend/requirements-dev.txt
```

- [ ] **Step 2: Create the package and test fixtures**

Create `Collection studio/backend/mockup/__init__.py` as an empty file.

Create `Collection studio/tests/__init__.py` as an empty file.

Create `Collection studio/tests/conftest.py`:

```python
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


@pytest.fixture
def white_on_white_plate():
    """Near-white garment on a pure white background, like the front plate."""
    size = 256
    img = Image.new("RGB", (size, size), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.polygon(_garment_polygon(size), fill=(250, 250, 250))
    return img.filter(ImageFilter.GaussianBlur(1))


@pytest.fixture
def grey_gradient_plate():
    """Garment on a grey background with a gradient and shadow, like the back plate."""
    size = 256
    ramp = np.linspace(232, 220, size).reshape(size, 1)
    bg = np.repeat(np.repeat(ramp, size, axis=1)[:, :, None], 3, axis=2)
    img = Image.fromarray(bg.astype(np.uint8))
    draw = ImageDraw.Draw(img)
    # Offset shadow first, then the garment on top.
    shadow = [(x + 10, y + 10) for x, y in _garment_polygon(size)]
    draw.polygon(shadow, fill=(205, 205, 205))
    draw.polygon(_garment_polygon(size), fill=(252, 252, 252))
    return img.filter(ImageFilter.GaussianBlur(2))


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
```

- [ ] **Step 3: Write the failing tests**

Create `Collection studio/tests/test_cutout.py`:

```python
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
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd "Collection studio" && python3 -m pytest tests/test_cutout.py -v`
Expected: FAIL, collection error `ModuleNotFoundError: No module named 'backend.mockup.cutout'`

- [ ] **Step 5: Implement the cutout**

Create `Collection studio/backend/mockup/cutout.py`:

```python
"""
Separate the garment from a base plate's background.

Two failure modes drive the approach, one from each locked plate:

  * The front plate is a white garment on a pure white background, so there is
    almost no colour difference to threshold on. What does exist is structure:
    the garment has seams, folds and fleece texture, the background does not.
  * The back plate sits on a soft grey gradient with a drop shadow. A single
    global threshold catches the shadow too and returns roughly two thirds of
    the frame instead of the garment.

So the mask combines two independent signals and keeps only the largest
connected region:

  1. Darkness relative to a *locally* estimated background, which tolerates the
     gradient that defeats a global threshold.
  2. Local contrast (the spread between a local max and local min), which finds
     the white-on-white garment by its texture and rejects the smooth shadow.
"""

import numpy as np
from PIL import Image, ImageFilter

# Rows/columns sampled at each edge to estimate the background.
_EDGE = 24
# How much darker than the local background a pixel must be to count as garment.
_DARKNESS_THRESHOLD = 3.0
# How much local contrast marks a textured (garment) pixel.
_CONTRAST_THRESHOLD = 2.5
# Radius for the local min/max used to measure contrast.
_CONTRAST_RADIUS = 2
# Softens the final edge so composites do not alias.
_EDGE_FEATHER = 1.5


def _background_field(grey: np.ndarray) -> np.ndarray:
    """
    Estimate the background brightness at every pixel.

    Sampling only the frame's edges and fitting a vertical ramp is enough: the
    plates are lit flat, so their backgrounds vary smoothly top to bottom and
    barely at all left to right.
    """
    left = grey[:, :_EDGE].mean(axis=1)
    right = grey[:, -_EDGE:].mean(axis=1)
    per_row = np.maximum(left, right)

    # The garment touches the left and right edges on some rows of some plates.
    # Taking the brightest of the two sides, then a generous rolling maximum,
    # keeps the estimate on background rather than on garment.
    height = per_row.size
    window = max(3, height // 16)
    padded = np.pad(per_row, window, mode="edge")
    rolled = np.array([padded[i:i + 2 * window + 1].max() for i in range(height)])
    return np.repeat(rolled[:, None], grey.shape[1], axis=1)


def _local_contrast(image: Image.Image) -> np.ndarray:
    hi = np.asarray(image.filter(ImageFilter.MaxFilter(2 * _CONTRAST_RADIUS + 1)), dtype=np.float32)
    lo = np.asarray(image.filter(ImageFilter.MinFilter(2 * _CONTRAST_RADIUS + 1)), dtype=np.float32)
    return hi - lo


def _downscale(mask: np.ndarray, factor: int) -> np.ndarray:
    h = (mask.shape[0] // factor) * factor
    w = (mask.shape[1] // factor) * factor
    blocks = mask[:h, :w].reshape(h // factor, factor, w // factor, factor)
    return blocks.any(axis=(1, 3))


def _upscale(mask: np.ndarray, factor: int, shape) -> np.ndarray:
    grown = np.repeat(np.repeat(mask, factor, axis=0), factor, axis=1)
    out = np.zeros(shape, dtype=bool)
    out[:grown.shape[0], :grown.shape[1]] = grown
    # Restore the rows/columns the downscale truncated.
    if grown.shape[0] < shape[0]:
        out[grown.shape[0]:, :] = out[grown.shape[0] - 1, :]
    if grown.shape[1] < shape[1]:
        out[:, grown.shape[1]:] = out[:, grown.shape[1] - 1][:, None]
    return out


def _connectivity_scale(mask: np.ndarray) -> int:
    """
    Both flood fills below iterate until they converge, one dilation per pass.
    On a full 2048px plate the garment spans ~1800 rows, so that is ~1800
    passes over a 4-megapixel array: tens of seconds per plate. Running the
    connectivity at 1/8 scale cuts it to a couple of hundred passes over a tiny
    array, and costs nothing in quality because the result is feathered anyway
    and only decides which blob survives, not where its edge sits.
    """
    return max(1, min(mask.shape) // 256)


def _largest_component(mask: np.ndarray) -> np.ndarray:
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


def _fill_holes(mask: np.ndarray) -> np.ndarray:
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


def extract_alpha(image: Image.Image) -> np.ndarray:
    """
    Return the garment's alpha as float32 in [0, 1], shape (H, W).

    1.0 is fully garment, 0.0 fully background, with a feathered edge between.
    """
    grey_image = image.convert("L")
    grey = np.asarray(grey_image, dtype=np.float32)

    darker = _background_field(grey) - grey > _DARKNESS_THRESHOLD
    textured = _local_contrast(grey_image) > _CONTRAST_THRESHOLD

    mask = _largest_component(darker | textured)
    mask = _fill_holes(mask)

    soft = Image.fromarray((mask * 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(_EDGE_FEATHER)
    )
    return (np.asarray(soft, dtype=np.float32) / 255.0).astype(np.float32)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd "Collection studio" && python3 -m pytest tests/test_cutout.py -v`
Expected: PASS, 7 passed

If `test_does_not_leak_into_drop_shadow` fails with coverage above 0.5, the shadow is being caught: raise `_DARKNESS_THRESHOLD` until it passes without breaking `test_real_back_plate_coverage`.

- [ ] **Step 7: Commit**

```bash
cd "Collection studio"
git add backend/mockup/__init__.py backend/mockup/cutout.py backend/requirements-dev.txt tests/
git commit -m "feat(mockup): extract garment alpha from base plates"
```

---

### Task 2: Plate calibration

Establishes the pixels-per-centimetre contract. Every placement claim in the app depends on this number, so it is measured by hand once per plate and stored, not inferred by a heuristic that could silently drift.

The existing `scripts/calibrate_studio_flats.py` derives `chest_px` automatically by taking the median silhouette width across the lower torso. That works on flat technical drawings, where the sleeves splay away from the body. It does **not** transfer to a photographic plate, where the sleeves hang against the body and the silhouette width at chest height is body plus both sleeves. So the two pit points are recorded by hand and everything else is derived.

**Files:**
- Create: `Collection studio/backend/mockup/calibrate.py`
- Create: `Collection studio/assets/mockup/plates.json`
- Create: `Collection studio/tests/test_calibrate.py`

**Interfaces:**
- Consumes: `extract_alpha(image) -> np.ndarray` from Task 1.
- Produces:
  - `Calibration` dataclass with fields `px_per_cm: float`, `hsp_y: int`, `center_x: int`.
  - `load_plate_spec(garment: str, tone: str, view: str) -> dict` reading `assets/mockup/plates.json`.
  - `calibrate(alpha: np.ndarray, spec: dict) -> Calibration`.
  - `MissingCalibration(Exception)`.

- [ ] **Step 1: Record the hand-measured plate specs**

Create `Collection studio/assets/mockup/plates.json`:

```json
{
  "hoodie": {
    "chest_cm": 61.0,
    "panel": {
      "top_cm": 8.0,
      "bottom_cm": 45.0,
      "half_width_cm": 22.0
    },
    "white": {
      "front": {
        "file": "base/hoodie_white_front.png",
        "pit_left_x": 470,
        "pit_right_x": 1600
      },
      "back": {
        "file": "base/hoodie_white_back.png",
        "pit_left_x": 470,
        "pit_right_x": 1600
      }
    }
  }
}
```

`chest_cm` is the hoodie's size-M pit-to-pit width from the tech pack POM ("Width of chest, pit to pit flat"). `panel` bounds the printable area in centimetres from HSP and from the centreline, and is consumed in Task 3.

The two `pit_*_x` values are placeholders to be corrected in Step 5 against the real plates. They are deliberately not left as `null`: the verification step below prints the measured chest width in centimetres, which makes a wrong value obvious immediately.

- [ ] **Step 2: Write the failing tests**

Create `Collection studio/tests/test_calibrate.py`:

```python
import json

import numpy as np
import pytest

from backend.mockup.calibrate import (
    Calibration,
    MissingCalibration,
    calibrate,
    load_plate_spec,
)
from backend.mockup.cutout import extract_alpha


def test_px_per_cm_is_pit_span_over_chest_cm():
    alpha = np.zeros((100, 100), dtype=np.float32)
    alpha[20:80, 20:80] = 1.0
    spec = {"chest_cm": 50.0, "pit_left_x": 20, "pit_right_x": 70}
    calib = calibrate(alpha, spec)
    assert calib.px_per_cm == pytest.approx(1.0)


def test_center_x_is_silhouette_midpoint():
    alpha = np.zeros((100, 100), dtype=np.float32)
    alpha[20:80, 30:70] = 1.0
    spec = {"chest_cm": 40.0, "pit_left_x": 30, "pit_right_x": 70}
    calib = calibrate(alpha, spec)
    assert calib.center_x == 49


def test_hsp_skips_a_narrow_hood_tip():
    """
    HSP is the shoulder line, not the topmost pixel. A hood tip is narrow, so
    the scan must pass it and stop where the silhouette reaches half the chest
    width.
    """
    alpha = np.zeros((200, 200), dtype=np.float32)
    alpha[10:50, 95:105] = 1.0   # narrow hood tip
    alpha[50:180, 40:160] = 1.0  # shoulders and body
    spec = {"chest_cm": 60.0, "pit_left_x": 40, "pit_right_x": 160}
    calib = calibrate(alpha, spec)
    assert calib.hsp_y == 50


def test_missing_pit_measurement_raises():
    alpha = np.ones((10, 10), dtype=np.float32)
    with pytest.raises(MissingCalibration):
        calibrate(alpha, {"chest_cm": 60.0})


def test_zero_width_pit_span_raises():
    alpha = np.ones((10, 10), dtype=np.float32)
    with pytest.raises(MissingCalibration):
        calibrate(alpha, {"chest_cm": 60.0, "pit_left_x": 50, "pit_right_x": 50})


def test_load_plate_spec_merges_garment_and_view_keys():
    spec = load_plate_spec("hoodie", "white", "front")
    assert spec["chest_cm"] == 61.0
    assert spec["file"] == "base/hoodie_white_front.png"
    assert "pit_left_x" in spec


def test_load_plate_spec_unknown_plate_raises():
    with pytest.raises(MissingCalibration):
        load_plate_spec("hoodie", "chartreuse", "front")


def test_real_front_plate_measures_a_plausible_hoodie(real_front_plate):
    """
    A size-M hoodie is 61cm pit to pit. If the recorded pit points are right,
    the full garment silhouette should be somewhere between one and three
    chest widths across. Anything outside that means the plate spec is wrong.
    """
    alpha = extract_alpha(real_front_plate)
    spec = load_plate_spec("hoodie", "white", "front")
    calib = calibrate(alpha, spec)
    cols = np.flatnonzero((alpha > 0.5).any(axis=0))
    silhouette_cm = (cols.max() - cols.min()) / calib.px_per_cm
    assert 61.0 < silhouette_cm < 183.0
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd "Collection studio" && python3 -m pytest tests/test_calibrate.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'backend.mockup.calibrate'`

- [ ] **Step 4: Implement calibration**

Create `Collection studio/backend/mockup/calibrate.py`:

```python
"""
Pixel-to-centimetre calibration for a base plate.

Mirrors the three numbers the flats already carry in data.js (`pxPerCm`,
`hspY`, `centerX`) so a placement expressed in centimetres means the same
thing on a flat, on a mockup, and on the tech pack the factory receives.

`scripts/calibrate_studio_flats.py` derives the chest width automatically from
the silhouette. That works on flat technical drawings, where the sleeves splay
away from the body, and does not transfer to a photographic plate, where the
sleeves hang against the body and the silhouette at chest height is body plus
both sleeves. The two pit points are therefore recorded by hand in
`assets/mockup/plates.json`, once per plate, and everything else is derived.
"""

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parent.parent.parent
PLATES_JSON = REPO / "assets" / "mockup" / "plates.json"

# A row counts as "the shoulder line" once the silhouette reaches this fraction
# of the chest width. Same convention as calibrate_studio_flats.py, so a hood
# tip is skipped rather than mistaken for the collar.
_HSP_WIDTH_FRACTION = 0.5


class MissingCalibration(Exception):
    """Raised when a plate cannot be calibrated. Never fall back to a guess."""


@dataclass(frozen=True)
class Calibration:
    px_per_cm: float
    hsp_y: int
    center_x: int


def load_plate_spec(garment: str, tone: str, view: str) -> dict:
    """Flatten the garment-level and view-level keys into one spec dict."""
    try:
        data = json.loads(PLATES_JSON.read_text())
    except FileNotFoundError as exc:
        raise MissingCalibration(f"no plate registry at {PLATES_JSON}") from exc

    try:
        garment_spec = data[garment]
        view_spec = garment_spec[tone][view]
    except KeyError as exc:
        raise MissingCalibration(
            f"no plate recorded for {garment}/{tone}/{view} in {PLATES_JSON}"
        ) from exc

    merged = {k: v for k, v in garment_spec.items() if not isinstance(v, dict)}
    merged["panel"] = garment_spec.get("panel", {})
    merged.update(view_spec)
    return merged


def calibrate(alpha: np.ndarray, spec: dict) -> Calibration:
    """Derive px_per_cm, hsp_y and center_x for one plate."""
    left = spec.get("pit_left_x")
    right = spec.get("pit_right_x")
    if left is None or right is None:
        raise MissingCalibration("plate spec is missing pit_left_x / pit_right_x")

    pit_span_px = float(right) - float(left)
    if pit_span_px <= 0:
        raise MissingCalibration(
            f"pit_right_x ({right}) must be greater than pit_left_x ({left})"
        )

    chest_cm = float(spec["chest_cm"])
    px_per_cm = pit_span_px / chest_cm

    solid = alpha > 0.5
    cols = np.flatnonzero(solid.any(axis=0))
    if cols.size == 0:
        raise MissingCalibration("alpha is empty, nothing to calibrate")
    center_x = int((cols.min() + cols.max()) / 2)

    target_width = pit_span_px * _HSP_WIDTH_FRACTION
    hsp_y = 0
    for row in range(solid.shape[0]):
        row_cols = np.flatnonzero(solid[row])
        if row_cols.size and (row_cols.max() - row_cols.min()) >= target_width:
            hsp_y = row
            break

    return Calibration(px_per_cm=px_per_cm, hsp_y=hsp_y, center_x=center_x)
```

- [ ] **Step 5: Correct the recorded pit points against the real plates**

The values in Step 1 are placeholders. Measure the real ones and write them in.

Run this to render a ruler overlay on each plate:

```bash
cd "Collection studio" && python3 -c "
from PIL import Image, ImageDraw
from pathlib import Path
d = Path('assets/mockup/base')
for view in ('front', 'back'):
    im = Image.open(d / f'hoodie_white_{view}.png').convert('RGB')
    draw = ImageDraw.Draw(im)
    for x in range(0, im.width, 100):
        draw.line([(x, 0), (x, im.height)], fill=(255, 0, 0), width=2)
        draw.text((x + 4, 10), str(x), fill=(255, 0, 0))
    im.save(d / '_clean' / f'ruler_{view}.png')
print('wrote ruler_front.png and ruler_back.png')
"
```

Open both ruler images. Read off the x coordinate of the left armpit and the right armpit (where the sleeve meets the body, at the narrowest point of that join). Write those into `assets/mockup/plates.json` for each view.

Verify the result is physically sensible:

```bash
cd "Collection studio" && python3 -c "
from PIL import Image
from backend.mockup.calibrate import load_plate_spec, calibrate
from backend.mockup.cutout import extract_alpha
import numpy as np
for view in ('front', 'back'):
    spec = load_plate_spec('hoodie', 'white', view)
    alpha = extract_alpha(Image.open('assets/mockup/' + spec['file']).convert('RGB'))
    c = calibrate(alpha, spec)
    cols = np.flatnonzero((alpha > 0.5).any(axis=0))
    rows = np.flatnonzero((alpha > 0.5).any(axis=1))
    print(view, 'px/cm', round(c.px_per_cm, 3), 'hspY', c.hsp_y, 'centerX', c.center_x)
    print('   silhouette', round((cols.max()-cols.min())/c.px_per_cm, 1), 'cm wide,',
          round((rows.max()-rows.min())/c.px_per_cm, 1), 'cm tall')
"
```

Expected: an oversized size-M hoodie roughly 120 to 150 cm across including both sleeves, and roughly 70 to 85 cm tall including the hood. If the printed numbers are far outside that, the pit points are wrong. Fix them before continuing, because every later measurement inherits this error.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd "Collection studio" && python3 -m pytest tests/test_calibrate.py -v`
Expected: PASS, 8 passed

- [ ] **Step 7: Commit**

```bash
cd "Collection studio"
git add backend/mockup/calibrate.py assets/mockup/plates.json tests/test_calibrate.py
git commit -m "feat(mockup): calibrate plates to centimetres from hand-measured pit points"
```

---

### Task 3: Derived maps

Produces the `shade` and `mask` maps this phase composites with, plus the `depth` map phase 2 will warp with. All three are computed from the plate, no AI involved.

**Files:**
- Create: `Collection studio/backend/mockup/maps.py`
- Create: `Collection studio/tests/test_maps.py`

**Interfaces:**
- Consumes: `Calibration` from Task 2.
- Produces:
  - `build_shade(image: Image.Image, alpha: np.ndarray) -> np.ndarray`, float32 `(H, W)`, 1.0 where the plate is at its median brightness, below 1.0 in shadow, above in highlight.
  - `build_depth(image: Image.Image, alpha: np.ndarray) -> np.ndarray`, float32 `(H, W)` in `[-1, 1]`, fold geometry only.
  - `build_panel_mask(alpha: np.ndarray, calib: Calibration, panel: dict) -> np.ndarray`, float32 `(H, W)` in `[0, 1]`.

- [ ] **Step 1: Write the failing tests**

Create `Collection studio/tests/test_maps.py`:

```python
import numpy as np
from PIL import Image

from backend.mockup.calibrate import Calibration
from backend.mockup.maps import build_depth, build_panel_mask, build_shade


def _gradient_plate(size=128):
    ramp = np.linspace(180, 255, size).reshape(1, size)
    arr = np.repeat(np.repeat(ramp, size, axis=0)[:, :, None], 3, axis=2)
    return Image.fromarray(arr.astype(np.uint8))


def test_shade_is_near_one_on_average_over_the_garment():
    plate = _gradient_plate()
    alpha = np.ones((128, 128), dtype=np.float32)
    shade = build_shade(plate, alpha)
    assert shade.dtype == np.float32
    assert 0.95 < float(shade.mean()) < 1.05


def test_shade_is_darker_where_the_plate_is_darker():
    plate = _gradient_plate()
    alpha = np.ones((128, 128), dtype=np.float32)
    shade = build_shade(plate, alpha)
    assert shade[64, 5] < shade[64, 120]


def test_depth_ignores_broad_shading_and_keeps_only_local_detail():
    """
    A smooth ramp is shading, not folds. Depth must come out flat on it, or a
    print would warp along the whole garment instead of across its creases.
    """
    plate = _gradient_plate()
    alpha = np.ones((128, 128), dtype=np.float32)
    depth = build_depth(plate, alpha)
    assert float(np.abs(depth).max()) < 0.15


def test_depth_responds_to_a_crease():
    arr = np.full((128, 128, 3), 220, dtype=np.uint8)
    arr[:, 62:66] = 150  # a dark vertical crease
    depth = build_depth(Image.fromarray(arr), np.ones((128, 128), dtype=np.float32))
    assert float(np.abs(depth[:, 60:68]).max()) > 0.3


def test_panel_mask_sits_inside_the_garment():
    alpha = np.zeros((400, 400), dtype=np.float32)
    alpha[50:350, 100:300] = 1.0
    calib = Calibration(px_per_cm=4.0, hsp_y=50, center_x=200)
    panel = {"top_cm": 5.0, "bottom_cm": 40.0, "half_width_cm": 20.0}
    mask = build_panel_mask(alpha, calib, panel)
    assert mask[40, 200] == 0.0    # above the panel top
    assert mask[200, 200] == 1.0   # mid panel
    assert mask[200, 20] == 0.0    # outside the garment


def test_panel_mask_respects_the_centimetre_bounds():
    alpha = np.ones((400, 400), dtype=np.float32)
    calib = Calibration(px_per_cm=4.0, hsp_y=50, center_x=200)
    panel = {"top_cm": 5.0, "bottom_cm": 40.0, "half_width_cm": 20.0}
    mask = build_panel_mask(alpha, calib, panel)
    rows = np.flatnonzero(mask.any(axis=1))
    cols = np.flatnonzero(mask.any(axis=0))
    assert rows.min() == 70    # hsp_y 50 + 5cm * 4px
    assert rows.max() == 209   # hsp_y 50 + 40cm * 4px, exclusive
    assert cols.min() == 120   # center 200 - 20cm * 4px
    assert cols.max() == 279
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "Collection studio" && python3 -m pytest tests/test_maps.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'backend.mockup.maps'`

- [ ] **Step 3: Implement the maps**

Create `Collection studio/backend/mockup/maps.py`:

```python
"""
Maps derived from a base plate. No AI: all three fall out of the plate's own
luminance plus the calibration.

  shade  the plate's broad lighting, so a print picks up the same key light and
         shadow the fabric does
  depth  fold geometry with the broad lighting removed, so phase 2 can warp
         artwork into creases rather than along the whole garment
  mask   the printable panel, so artwork cannot run over the hem rib, the hood
         seam or the pocket
"""

import numpy as np
from PIL import Image, ImageFilter

# Separates broad lighting from local fold detail. Tuned for 2048px plates.
_SHADING_SIGMA = 40
# Fold contrast, in 8-bit levels, that maps to full depth.
_DEPTH_RANGE = 24.0


def _luminance(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("L"), dtype=np.float32)


def build_shade(image: Image.Image, alpha: np.ndarray) -> np.ndarray:
    """
    Broad lighting normalised so the garment's median reads as 1.0.

    Multiplying a print by this makes it sit in the plate's light instead of
    looking pasted on flat.
    """
    blurred = np.asarray(
        image.convert("L").filter(ImageFilter.GaussianBlur(_SHADING_SIGMA)),
        dtype=np.float32,
    )

    garment = alpha > 0.5
    reference = float(np.median(blurred[garment])) if garment.any() else 255.0
    reference = max(reference, 1.0)

    return (blurred / reference).astype(np.float32)


def build_depth(image: Image.Image, alpha: np.ndarray) -> np.ndarray:
    """
    Fold geometry in [-1, 1]: negative in creases, positive on ridges.

    High-passing removes the broad shading, which is what stops a print from
    bending along the garment's overall form instead of across its folds.
    """
    grey = _luminance(image)
    blurred = np.asarray(
        image.convert("L").filter(ImageFilter.GaussianBlur(_SHADING_SIGMA)),
        dtype=np.float32,
    )
    detail = (grey - blurred) / _DEPTH_RANGE
    return np.clip(detail, -1.0, 1.0).astype(np.float32) * (alpha > 0.5)


def build_panel_mask(alpha: np.ndarray, calib, panel: dict) -> np.ndarray:
    """
    The printable region: a centimetre-defined box, intersected with the
    garment itself so it can never spill onto the background.
    """
    height, width = alpha.shape
    mask = np.zeros((height, width), dtype=np.float32)

    top = calib.hsp_y + int(round(panel["top_cm"] * calib.px_per_cm))
    bottom = calib.hsp_y + int(round(panel["bottom_cm"] * calib.px_per_cm))
    half = int(round(panel["half_width_cm"] * calib.px_per_cm))
    left = calib.center_x - half
    right = calib.center_x + half

    top, bottom = max(top, 0), min(bottom, height)
    left, right = max(left, 0), min(right, width)
    if top >= bottom or left >= right:
        return mask

    mask[top:bottom, left:right] = 1.0
    return (mask * (alpha > 0.5)).astype(np.float32)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "Collection studio" && python3 -m pytest tests/test_maps.py -v`
Expected: PASS, 6 passed

- [ ] **Step 5: Commit**

```bash
cd "Collection studio"
git add backend/mockup/maps.py tests/test_maps.py
git commit -m "feat(mockup): derive shade, depth and panel-mask maps from plates"
```

---

### Task 4: Template builder and cache

Runs tasks 1 to 3 once per plate and caches the result, so a render never recomputes maps. Also gives a visual check that the panel mask lands where it should.

**Files:**
- Create: `Collection studio/backend/mockup/template.py`
- Create: `Collection studio/scripts/build_mockup_maps.py`
- Create: `Collection studio/tests/test_template.py`
- Modify: `Collection studio/.gitignore`

**Interfaces:**
- Consumes: `extract_alpha` (Task 1), `load_plate_spec` / `calibrate` / `Calibration` / `MissingCalibration` (Task 2), `build_shade` / `build_depth` / `build_panel_mask` (Task 3).
- Produces:
  - `Template` dataclass with fields `plate: Image.Image`, `alpha: np.ndarray`, `shade: np.ndarray`, `depth: np.ndarray`, `panel: np.ndarray`, `calib: Calibration`.
  - `build_template(garment: str, tone: str, view: str) -> Template`.
  - `cache_template(template: Template, garment: str, tone: str, view: str) -> Path`.
  - `load_template(garment: str, tone: str, view: str) -> Template` reading the cache, building and caching on a miss.

- [ ] **Step 1: Write the failing tests**

Create `Collection studio/tests/test_template.py`:

```python
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


def test_panel_is_a_meaningful_fraction_of_the_garment(real_back_plate):
    template = build_template("hoodie", "white", "back")
    garment_px = float((template.alpha > 0.5).sum())
    panel_px = float((template.panel > 0.5).sum())
    assert 0.15 < panel_px / garment_px < 0.75


def test_cache_round_trips(real_front_plate):
    first = load_template("hoodie", "white", "front")
    second = load_template("hoodie", "white", "front")
    assert np.allclose(first.alpha, second.alpha)
    assert np.allclose(first.shade, second.shade)
    assert first.calib == second.calib


def test_plates_are_never_resized(real_front_plate):
    template = build_template("hoodie", "white", "front")
    assert template.plate.size == (2048, 2048)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "Collection studio" && python3 -m pytest tests/test_template.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'backend.mockup.template'`

- [ ] **Step 3: Implement the template**

Create `Collection studio/backend/mockup/template.py`:

```python
"""
A base plate plus everything derived from it, built once and cached.

Deriving the maps costs a couple of seconds per plate, which is fine as a
one-off and not fine on every render, so the result is cached to an .npz beside
the plates. The cache is disposable: delete it and the next call rebuilds.
"""

from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from .calibrate import Calibration, calibrate, load_plate_spec
from .cutout import extract_alpha
from .maps import build_depth, build_panel_mask, build_shade

REPO = Path(__file__).resolve().parent.parent.parent
MOCKUP_DIR = REPO / "assets" / "mockup"
CACHE_DIR = MOCKUP_DIR / "_cache"


@dataclass(frozen=True)
class Template:
    plate: Image.Image
    alpha: np.ndarray
    shade: np.ndarray
    depth: np.ndarray
    panel: np.ndarray
    calib: Calibration


def _cache_path(garment: str, tone: str, view: str) -> Path:
    return CACHE_DIR / f"{garment}_{tone}_{view}.npz"


def build_template(garment: str, tone: str, view: str) -> Template:
    """Derive every map for one plate from scratch."""
    spec = load_plate_spec(garment, tone, view)
    plate_path = MOCKUP_DIR / spec["file"]
    if not plate_path.exists():
        raise FileNotFoundError(f"missing base plate: {plate_path}")

    plate = Image.open(plate_path).convert("RGB")
    alpha = extract_alpha(plate)
    calib = calibrate(alpha, spec)

    return Template(
        plate=plate,
        alpha=alpha,
        shade=build_shade(plate, alpha),
        depth=build_depth(plate, alpha),
        panel=build_panel_mask(alpha, calib, spec["panel"]),
        calib=calib,
    )


def cache_template(template: Template, garment: str, tone: str, view: str) -> Path:
    path = _cache_path(garment, tone, view)
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        path,
        alpha=template.alpha,
        shade=template.shade,
        depth=template.depth,
        panel=template.panel,
        px_per_cm=np.float32(template.calib.px_per_cm),
        hsp_y=np.int32(template.calib.hsp_y),
        center_x=np.int32(template.calib.center_x),
    )
    return path


def load_template(garment: str, tone: str, view: str) -> Template:
    """Read the cached template, building and caching it on a miss."""
    path = _cache_path(garment, tone, view)
    if not path.exists():
        template = build_template(garment, tone, view)
        cache_template(template, garment, tone, view)
        return template

    spec = load_plate_spec(garment, tone, view)
    with np.load(path) as data:
        return Template(
            plate=Image.open(MOCKUP_DIR / spec["file"]).convert("RGB"),
            alpha=data["alpha"],
            shade=data["shade"],
            depth=data["depth"],
            panel=data["panel"],
            calib=Calibration(
                px_per_cm=float(data["px_per_cm"]),
                hsp_y=int(data["hsp_y"]),
                center_x=int(data["center_x"]),
            ),
        )
```

- [ ] **Step 4: Ignore the cache in git**

Add to `Collection studio/.gitignore`:

```
assets/mockup/_cache/
```

- [ ] **Step 5: Write the builder CLI**

Create `Collection studio/scripts/build_mockup_maps.py`:

```python
#!/usr/bin/env python3
"""
Derive and cache the maps for every plate in assets/mockup/plates.json.

Also writes a visual check per plate: the panel mask tinted over the plate, so
a mask that lands on the pocket or runs into the hem rib is obvious at a glance
rather than showing up later as a misplaced print.

Usage:
    python3 scripts/build_mockup_maps.py
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from backend.mockup.template import (  # noqa: E402
    MOCKUP_DIR,
    build_template,
    cache_template,
)

CHECK_DIR = MOCKUP_DIR / "_check"


def write_check(template, garment, tone, view) -> Path:
    plate = np.asarray(template.plate, dtype=np.float32)
    tint = np.zeros_like(plate)
    tint[:, :, 1] = 255.0  # green over the printable panel
    weight = (template.panel > 0.5)[:, :, None] * 0.28
    blended = plate * (1.0 - weight) + tint * weight

    CHECK_DIR.mkdir(parents=True, exist_ok=True)
    path = CHECK_DIR / f"panel_{garment}_{tone}_{view}.png"
    Image.fromarray(np.clip(blended, 0, 255).astype(np.uint8)).save(path)
    return path


def main():
    registry = json.loads((MOCKUP_DIR / "plates.json").read_text())

    for garment, garment_spec in registry.items():
        for tone, views in garment_spec.items():
            if not isinstance(views, dict) or "front" not in views:
                continue  # chest_cm, panel, and other non-tone keys
            for view in views:
                template = build_template(garment, tone, view)
                cache_template(template, garment, tone, view)
                check = write_check(template, garment, tone, view)
                calib = template.calib
                print(
                    f"  {garment}/{tone}/{view}  "
                    f"px/cm {calib.px_per_cm:.3f}  hspY {calib.hsp_y}  "
                    f"centerX {calib.center_x}  ->  {check.relative_to(REPO)}"
                )


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Run the builder and eyeball the panel checks**

Run: `cd "Collection studio" && python3 scripts/build_mockup_maps.py`
Expected: two lines printed, one per view, and two files in `assets/mockup/_check/`.

Open both. The green tint must cover the chest panel (front) and the back panel (back), and must **not** reach the hood, the ribbed hem, the cuffs, or the kangaroo pocket. If it does, adjust `panel.top_cm`, `panel.bottom_cm` or `panel.half_width_cm` in `plates.json`, delete `assets/mockup/_cache/`, and rerun.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd "Collection studio" && python3 -m pytest tests/ -v`
Expected: PASS, all tests

- [ ] **Step 8: Commit**

```bash
cd "Collection studio"
git add backend/mockup/template.py scripts/build_mockup_maps.py tests/test_template.py .gitignore
git commit -m "feat(mockup): build and cache per-plate templates"
```

---

### Task 5: Centimetre-accurate compositing

The point of the phase. Places artwork on a template at an exact centimetre offset and proves the measurement holds.

**Files:**
- Create: `Collection studio/backend/mockup/compose.py`
- Create: `Collection studio/tests/test_compose.py`

**Interfaces:**
- Consumes: `Template` and `load_template` from Task 4.
- Produces:
  - `Placement` dataclass with fields `width_cm: float`, `drop_cm: float`, `offset_cm: float = 0.0`.
  - `place(template: Template, artwork: Image.Image, placement: Placement) -> tuple[int, int, int, int]` returning the artwork's `(left, top, right, bottom)` box in plate pixels.
  - `compose(template: Template, artwork: Image.Image, placement: Placement) -> Image.Image` returning an RGBA image at plate resolution.

- [ ] **Step 1: Write the failing tests**

Create `Collection studio/tests/test_compose.py`:

```python
import numpy as np
import pytest
from PIL import Image

from backend.mockup.calibrate import Calibration
from backend.mockup.compose import Placement, compose, place
from backend.mockup.template import Template


@pytest.fixture
def flat_template():
    """A featureless white template with round numbers: 10 px per cm."""
    size = 800
    plate = Image.new("RGB", (size, size), (255, 255, 255))
    alpha = np.zeros((size, size), dtype=np.float32)
    alpha[100:700, 150:650] = 1.0
    panel = np.zeros((size, size), dtype=np.float32)
    panel[150:650, 200:600] = 1.0
    return Template(
        plate=plate,
        alpha=alpha,
        shade=np.ones((size, size), dtype=np.float32),
        depth=np.zeros((size, size), dtype=np.float32),
        panel=panel,
        calib=Calibration(px_per_cm=10.0, hsp_y=100, center_x=400),
    )


def _artwork(w=40, h=20, colour=(200, 0, 0, 255)):
    return Image.new("RGBA", (w, h), colour)


def test_a_12cm_print_measures_12cm(flat_template):
    left, _, right, _ = place(flat_template, _artwork(), Placement(width_cm=12.0, drop_cm=14.0))
    assert (right - left) / flat_template.calib.px_per_cm == pytest.approx(12.0, abs=0.05)


def test_drop_is_measured_to_the_top_of_the_print(flat_template):
    """
    Placement is collar to the HIGHEST point of the print, never to its centre.
    """
    _, top, _, _ = place(flat_template, _artwork(), Placement(width_cm=12.0, drop_cm=14.0))
    assert top - flat_template.calib.hsp_y == pytest.approx(140, abs=1)


def test_artwork_aspect_ratio_is_preserved(flat_template):
    left, top, right, bottom = place(
        flat_template, _artwork(w=40, h=20), Placement(width_cm=12.0, drop_cm=14.0)
    )
    assert (right - left) / (bottom - top) == pytest.approx(2.0, abs=0.05)


def test_horizontal_offset_shifts_from_the_centreline(flat_template):
    _, _, _, _ = place(flat_template, _artwork(), Placement(width_cm=10.0, drop_cm=14.0))
    left, _, right, _ = place(
        flat_template, _artwork(), Placement(width_cm=10.0, drop_cm=14.0, offset_cm=5.0)
    )
    assert (left + right) / 2 == pytest.approx(flat_template.calib.center_x + 50, abs=1)


def test_centred_by_default(flat_template):
    left, _, right, _ = place(flat_template, _artwork(), Placement(width_cm=10.0, drop_cm=14.0))
    assert (left + right) / 2 == pytest.approx(flat_template.calib.center_x, abs=1)


def test_composite_keeps_plate_resolution(flat_template):
    out = compose(flat_template, _artwork(), Placement(width_cm=12.0, drop_cm=14.0))
    assert out.size == flat_template.plate.size
    assert out.mode == "RGBA"


def test_artwork_is_clipped_to_the_printable_panel(flat_template):
    """A print pushed past the panel's bottom edge must be cut, not overflow."""
    out = compose(flat_template, _artwork(), Placement(width_cm=30.0, drop_cm=54.0))
    painted = np.asarray(out.convert("RGB"), dtype=np.float32)
    below_panel = painted[660:, :, 0]
    assert below_panel.min() > 240  # still white, nothing printed there


def test_print_lands_where_placement_says(flat_template):
    out = compose(flat_template, _artwork(), Placement(width_cm=12.0, drop_cm=14.0))
    red = np.asarray(out.convert("RGB"), dtype=np.float32)[:, :, 0] < 240
    rows = np.flatnonzero(red.any(axis=1))
    assert rows.min() == pytest.approx(240, abs=2)  # hsp_y 100 + 14cm * 10px


def test_shade_darkens_the_print(flat_template):
    dark = Template(**{**flat_template.__dict__, "shade": flat_template.shade * 0.5})
    lit = compose(flat_template, _artwork(colour=(200, 200, 200, 255)), Placement(12.0, 14.0))
    shaded = compose(dark, _artwork(colour=(200, 200, 200, 255)), Placement(12.0, 14.0))
    lit_px = np.asarray(lit.convert("RGB"), dtype=np.float32)[250, 400].mean()
    shaded_px = np.asarray(shaded.convert("RGB"), dtype=np.float32)[250, 400].mean()
    assert shaded_px < lit_px
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "Collection studio" && python3 -m pytest tests/test_compose.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'backend.mockup.compose'`

- [ ] **Step 3: Implement compositing**

Create `Collection studio/backend/mockup/compose.py`:

```python
"""
Place artwork on a template at an exact centimetre offset.

Phase 1 only: position, clip to the printable panel, and take the plate's
lighting. No fold displacement (phase 2) and no ink or thread rendering
(phase 3), so the output proves the measurements are right without yet
claiming to look real.

Placement follows the convention the tech pack already uses: the drop is
measured from HSP to the HIGHEST point of the print, never to its centre, and
the horizontal offset runs from the garment centreline.
"""

from dataclasses import dataclass

import numpy as np
from PIL import Image

from .template import Template


@dataclass(frozen=True)
class Placement:
    width_cm: float
    drop_cm: float
    offset_cm: float = 0.0


def place(template: Template, artwork: Image.Image, placement: Placement):
    """Return the artwork's (left, top, right, bottom) box in plate pixels."""
    calib = template.calib
    width_px = int(round(placement.width_cm * calib.px_per_cm))
    height_px = max(1, int(round(width_px * artwork.height / artwork.width)))

    centre_x = calib.center_x + int(round(placement.offset_cm * calib.px_per_cm))
    left = centre_x - width_px // 2
    top = calib.hsp_y + int(round(placement.drop_cm * calib.px_per_cm))

    return left, top, left + width_px, top + height_px


def compose(template: Template, artwork: Image.Image, placement: Placement) -> Image.Image:
    """Composite artwork onto the plate, clipped to the panel and lit by it."""
    left, top, right, bottom = place(template, artwork, placement)

    layer = Image.new("RGBA", template.plate.size, (0, 0, 0, 0))
    scaled = artwork.convert("RGBA").resize((right - left, bottom - top), Image.LANCZOS)
    layer.paste(scaled, (left, top))

    rgba = np.asarray(layer, dtype=np.float32)
    ink, ink_alpha = rgba[:, :, :3], rgba[:, :, 3] / 255.0

    # The print may only appear on the printable panel.
    ink_alpha = ink_alpha * template.panel

    # And it sits in the plate's own light rather than on top of it.
    ink = np.clip(ink * template.shade[:, :, None], 0, 255)

    plate = np.asarray(template.plate.convert("RGB"), dtype=np.float32)
    blended = plate * (1.0 - ink_alpha[:, :, None]) + ink * ink_alpha[:, :, None]

    out = np.dstack([blended, template.alpha * 255.0])
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), mode="RGBA")
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "Collection studio" && python3 -m pytest tests/test_compose.py -v`
Expected: PASS, 9 passed

- [ ] **Step 5: Commit**

```bash
cd "Collection studio"
git add backend/mockup/compose.py tests/test_compose.py
git commit -m "feat(mockup): composite artwork at exact centimetre placement"
```

---

### Task 6: End-to-end render CLI

Produces the artefact Alaa judges the phase on: the SOAP logo on the real back plate, at a real measured placement, with a printed statement of where it landed.

**Files:**
- Create: `Collection studio/scripts/render_mockup.py`
- Create: `Collection studio/tests/test_render_cli.py`

**Interfaces:**
- Consumes: `load_template` (Task 4), `Placement` / `compose` / `place` (Task 5).
- Produces: `render(garment, tone, view, artwork_path, placement, out_path) -> dict` returning the achieved measurements, keys `width_cm`, `drop_cm`, `offset_cm`.

- [ ] **Step 1: Write the failing test**

Create `Collection studio/tests/test_render_cli.py`:

```python
from pathlib import Path

import pytest
from PIL import Image

from scripts.render_mockup import render

REPO = Path(__file__).resolve().parent.parent


def test_render_reports_the_placement_it_achieved(tmp_path, real_back_plate):
    artwork = tmp_path / "art.png"
    Image.new("RGBA", (400, 200), (30, 30, 30, 255)).save(artwork)
    out = tmp_path / "mockup.png"

    achieved = render(
        garment="hoodie", tone="white", view="back",
        artwork_path=artwork,
        width_cm=28.0, drop_cm=20.0, offset_cm=0.0,
        out_path=out,
    )

    assert out.exists()
    assert Image.open(out).size == (2048, 2048)
    assert achieved["width_cm"] == pytest.approx(28.0, abs=0.1)
    assert achieved["drop_cm"] == pytest.approx(20.0, abs=0.1)


def test_render_refuses_an_unknown_plate(tmp_path):
    artwork = tmp_path / "art.png"
    Image.new("RGBA", (100, 100), (0, 0, 0, 255)).save(artwork)
    with pytest.raises(Exception):
        render(
            garment="hoodie", tone="chartreuse", view="back",
            artwork_path=artwork,
            width_cm=10.0, drop_cm=10.0, offset_cm=0.0,
            out_path=tmp_path / "out.png",
        )
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "Collection studio" && python3 -m pytest tests/test_render_cli.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'scripts.render_mockup'`

- [ ] **Step 3: Implement the CLI**

Create `Collection studio/scripts/__init__.py` as an empty file, so the test can import it.

Create `Collection studio/scripts/render_mockup.py`:

```python
#!/usr/bin/env python3
"""
Render one mockup end to end and report the placement actually achieved.

The report is the point. Phase 1 is judged on whether a print asked for at
28cm wide, 20cm below the collar, lands at 28cm wide, 20cm below the collar.
How real it looks is phases 2 and 3.

Usage:
    python3 scripts/render_mockup.py assets/logo.png \\
        --view back --width-cm 28 --drop-cm 20
"""

import argparse
import sys
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from backend.mockup.compose import Placement, compose, place  # noqa: E402
from backend.mockup.template import load_template  # noqa: E402


def render(garment, tone, view, artwork_path, width_cm, drop_cm, offset_cm, out_path):
    """Render a mockup and return the placement it achieved, in centimetres."""
    template = load_template(garment, tone, view)
    artwork = Image.open(artwork_path).convert("RGBA")
    placement = Placement(width_cm=width_cm, drop_cm=drop_cm, offset_cm=offset_cm)

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    compose(template, artwork, placement).save(out_path)

    left, top, right, _ = place(template, artwork, placement)
    px_per_cm = template.calib.px_per_cm
    return {
        "width_cm": (right - left) / px_per_cm,
        "drop_cm": (top - template.calib.hsp_y) / px_per_cm,
        "offset_cm": ((left + right) / 2 - template.calib.center_x) / px_per_cm,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("artwork", help="PNG to print, ideally with transparency")
    parser.add_argument("--garment", default="hoodie")
    parser.add_argument("--tone", default="white")
    parser.add_argument("--view", default="back", choices=["front", "back"])
    parser.add_argument("--width-cm", type=float, default=28.0)
    parser.add_argument("--drop-cm", type=float, default=20.0,
                        help="Collar (HSP) to the TOP of the print")
    parser.add_argument("--offset-cm", type=float, default=0.0)
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    out = Path(args.out) if args.out else (
        REPO / "assets" / "mockup" / "_render" /
        f"{args.garment}_{args.tone}_{args.view}.png"
    )

    achieved = render(
        garment=args.garment, tone=args.tone, view=args.view,
        artwork_path=args.artwork,
        width_cm=args.width_cm, drop_cm=args.drop_cm, offset_cm=args.offset_cm,
        out_path=out,
    )

    print(f"  wrote {out.relative_to(REPO)}")
    print(f"  asked for : {args.width_cm}cm wide, {args.drop_cm}cm below collar, "
          f"{args.offset_cm}cm off centre")
    print(f"  achieved  : {achieved['width_cm']:.2f}cm wide, "
          f"{achieved['drop_cm']:.2f}cm below collar, "
          f"{achieved['offset_cm']:.2f}cm off centre")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd "Collection studio" && python3 -m pytest tests/test_render_cli.py -v`
Expected: PASS, 2 passed

- [ ] **Step 5: Render the real thing**

Run:

```bash
cd "Collection studio" && python3 scripts/render_mockup.py assets/logo.png \
    --view back --width-cm 28 --drop-cm 20
```

Expected: the asked-for and achieved lines match to within 0.1cm, and `assets/mockup/_render/hoodie_white_back.png` exists at 2048x2048.

Open it. The logo must sit centred on the back panel, be flat (no fold warping yet, that is phase 2), and pick up the plate's shading. It will look pasted on. That is correct for this phase.

- [ ] **Step 6: Run the whole suite**

Run: `cd "Collection studio" && python3 -m pytest tests/ -v`
Expected: PASS, all tests

- [ ] **Step 7: Commit**

```bash
cd "Collection studio"
git add scripts/__init__.py scripts/render_mockup.py tests/test_render_cli.py
git commit -m "feat(mockup): end-to-end render CLI reporting achieved placement"
```

---

## Phase 1 done when

- `python3 -m pytest tests/ -v` passes.
- `scripts/render_mockup.py` reports achieved placement matching the request to within 0.1cm.
- The panel-mask check images show the printable area landing on the chest and back panels, clear of the hood, rib, cuffs and pocket.
- Alaa has looked at the rendered mockup and agrees the placement is right.

Phases 2 (displacement) and 3 (material: embroidery versus screen print) build on this and are planned separately.
