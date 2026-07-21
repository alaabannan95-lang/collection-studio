#!/usr/bin/env python3
"""
Derive and cache the maps for every plate in assets/mockup/plates.json.

Also writes a visual check per plate: the printable panel tinted over the
plate, so a panel that lands on the pocket or runs into the hem rib is obvious
at a glance rather than showing up later as a misplaced print.

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

from backend.mockup.calibrate import MOCKUP_DIR  # noqa: E402
from backend.mockup.template import build_template, cache_template  # noqa: E402

CHECK_DIR = MOCKUP_DIR / "_check"


def write_check(template, garment, tone, view):
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
                continue  # bottom_opening_cm, panel, and other non-tone keys
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
