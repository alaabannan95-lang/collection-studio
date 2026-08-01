"""
Print placement datums.

The factory prints to the centimetre figures on the tech pack, so the two
vertical datums (collar and hem) have to stay locked to the flats themselves.
This module checks the shipped data.js against the calibrator that derives
those numbers from the artwork, and runs the JavaScript geometry suite so one
`pytest` run covers both halves.
"""

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from backend.flats.calibrate_flats import GARMENT_POM, calibrate_flat  # noqa: E402


def _shipped_calibration() -> dict:
    """Parses the CALIBRATION table out of data.js.

    Read rather than imported because data.js is a browser script; keeping the
    parse here means a hand-edit to data.js still gets checked.
    """
    src = (REPO / "data.js").read_text()
    start = src.index("const CALIBRATION")
    end = src.index("// Every SOAP brand color")
    block = src[start:end]

    out: dict = {}
    for gm in re.finditer(r"'([\w-]+)':\s*\{(.*?)\n  \},", block, re.S):
        garment, body = gm.group(1), gm.group(2)
        out[garment] = {}
        for vm in re.finditer(r"(front|back):\s*\{([^}]*)\}", body):
            view, fields = vm.group(1), vm.group(2)
            out[garment][view] = {
                k: float(v) for k, v in re.findall(r"(\w+):\s*([\d.]+)", fields)
            }
    return out


SHIPPED = _shipped_calibration()
FLATS = [(g, v) for g in GARMENT_POM for v in ("front", "back")]


def test_every_garment_and_view_is_present():
    assert set(SHIPPED) == set(GARMENT_POM)
    for garment, views in SHIPPED.items():
        assert set(views) == {"front", "back"}, garment


@pytest.mark.parametrize("garment,view", FLATS)
def test_shipped_datums_match_the_calibrator(garment, view):
    """data.js must never drift from the artwork it describes."""
    calib = calibrate_flat(garment, view)
    shipped = SHIPPED[garment][view]

    assert shipped["pxPerCm"] == pytest.approx(calib.px_per_cm, abs=0.001)
    assert shipped["hspY"] == calib.hsp_y
    assert shipped["hemY"] == calib.hem_y, (
        f"{garment}/{view}: hem datum out of sync. Regenerate it from "
        f"backend/flats/calibrate_flats.py rather than editing data.js by hand."
    )
    assert shipped["necklineY"] == calib.neck_y, (
        f"{garment}/{view}: neckline datum out of sync. Regenerate it from "
        f"backend/flats/calibrate_flats.py rather than editing data.js by hand."
    )


HOODED = {"hoodie", "jacket"}


@pytest.mark.parametrize("garment,view", FLATS)
def test_hooded_collars_sit_above_hsp_and_others_below(garment, view):
    """The sign of this gap is the whole bug.

    A hood is drawn above the shoulders, so its collar line is ABOVE HSP; a
    ribbed collar is below. One "below collar" figure meant two different
    physical distances, up to 16cm apart, depending on the garment.
    """
    shipped = SHIPPED[garment][view]
    offset_cm = (shipped["necklineY"] - shipped["hspY"]) / shipped["pxPerCm"]

    if garment in HOODED:
        assert offset_cm < 0, f"{garment}/{view}: hood should sit above HSP, got {offset_cm:.1f}cm"
    else:
        assert 0 <= offset_cm < 15, f"{garment}/{view}: implausible neck drop {offset_cm:.1f}cm"


def test_hoodie_front_matches_the_measured_hood_v():
    """Pins the number behind the reported symptom.

    A chest print reading 6.7cm from HSP visibly sat ~10.8cm below the hood.
    The difference is this 4.1cm, measured off the artwork.
    """
    shipped = SHIPPED["hoodie"]["front"]
    offset_cm = (shipped["necklineY"] - shipped["hspY"]) / shipped["pxPerCm"]
    assert offset_cm == pytest.approx(-4.1, abs=0.2)


@pytest.mark.parametrize("garment", [g for g in GARMENT_POM if g not in HOODED])
def test_front_neck_is_deeper_than_back(garment):
    """Physical invariant, and the strongest check that the right line was found."""
    def drop(view):
        s = SHIPPED[garment][view]
        return (s["necklineY"] - s["hspY"]) / s["pxPerCm"]

    assert drop("front") >= drop("back"), garment


@pytest.mark.parametrize("garment,view", FLATS)
def test_hem_datum_is_below_the_collar_datum(garment, view):
    shipped = SHIPPED[garment][view]
    assert shipped["hemY"] > shipped["hspY"], f"{garment}/{view}"


@pytest.mark.parametrize("garment,view", FLATS)
def test_collar_to_hem_length_matches_the_point_of_measure(garment, view):
    """The distance between the two datums is a real, checkable measurement.

    Whatever the drawing's resolution, collar-to-hem must come out as the
    garment's actual front length. This is what makes an "x cm above hem"
    figure trustworthy on the tech pack.
    """
    shipped = SHIPPED[garment][view]
    length_cm = (shipped["hemY"] - shipped["hspY"]) / shipped["pxPerCm"]

    pom = GARMENT_POM[garment]
    expected = pom.get("front_length_cm") or pom.get("full_length_cm")
    assert expected is not None, f"no length reference for {garment}"
    assert length_cm == pytest.approx(expected, abs=0.5), (
        f"{garment}/{view}: measures {length_cm:.1f}cm, POM says {expected}cm"
    )


def test_javascript_placement_suite_passes():
    """Runs the Node geometry suite so one pytest run covers both languages."""
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is not installed; run tests/placement.test.mjs manually")

    result = subprocess.run(
        [node, "--test", "tests/placement.test.mjs"],
        cwd=REPO, capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
