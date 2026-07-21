"""
A base plate plus everything derived from it, built once and cached.

Deriving the maps costs a few seconds per plate, which is fine as a one-off and
not fine on every render, so the result is cached to an .npz beside the plates.
The cache is disposable: delete it and the next call rebuilds.
"""

from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from .calibrate import (
    MOCKUP_DIR,
    MissingCalibration,
    PlateCalibration,
    calibrate_plate,
    load_plate_spec,
)
from .cutout import extract_alpha
from .maps import build_depth, build_panel_mask, build_shade

REPO = Path(__file__).resolve().parent.parent.parent
CACHE_DIR = MOCKUP_DIR / "_cache"


@dataclass(frozen=True)
class Template:
    plate: Image.Image
    alpha: np.ndarray
    shade: np.ndarray
    depth: np.ndarray
    panel: np.ndarray
    calib: PlateCalibration


def _cache_path(garment, tone, view):
    return CACHE_DIR / f"{garment}_{tone}_{view}.npz"


def build_template(garment, tone, view):
    """Derive every map for one plate from scratch."""
    spec = load_plate_spec(garment, tone, view)
    plate_path = MOCKUP_DIR / spec["file"]
    if not plate_path.exists():
        raise MissingCalibration(f"missing base plate: {plate_path}")

    plate = Image.open(plate_path).convert("RGB")
    alpha = extract_alpha(plate)
    calib = calibrate_plate(garment, tone, view)

    return Template(
        plate=plate,
        alpha=alpha,
        shade=build_shade(plate, alpha),
        depth=build_depth(plate, alpha),
        panel=build_panel_mask(alpha, calib, spec["panel"]),
        calib=calib,
    )


def cache_template(template, garment, tone, view):
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
        hem_y=np.int32(template.calib.hem_y),
    )
    return path


def load_template(garment, tone, view):
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
            calib=PlateCalibration(
                px_per_cm=float(data["px_per_cm"]),
                hsp_y=int(data["hsp_y"]),
                center_x=int(data["center_x"]),
                hem_y=int(data["hem_y"]),
            ),
        )
