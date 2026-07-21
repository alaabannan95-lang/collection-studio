from pathlib import Path

import pytest
from PIL import Image

from scripts.render_mockup import render

REPO = Path(__file__).resolve().parent.parent


def test_render_writes_all_three_outputs(tmp_path, real_back_plate):
    artwork = tmp_path / "art.png"
    Image.new("RGBA", (400, 200), (30, 30, 30, 255)).save(artwork)

    result = render(
        garment="hoodie", tone="white", view="back",
        artwork_path=artwork, method="screen",
        width_cm=28.0, drop_cm=22.0, offset_cm=0.0,
        out_dir=tmp_path,
    )

    # Transparent PNG for the try-on AI.
    transparent = Image.open(result["transparent"])
    assert transparent.mode == "RGBA"
    assert transparent.size == (2048, 2048)
    assert transparent.getchannel("A").getextrema()[0] == 0  # has real transparency

    # White-background JPEG for Shopify.
    shopify = Image.open(result["shopify"])
    assert shopify.mode == "RGB"
    corner = shopify.getpixel((5, 5))
    assert min(corner) > 245  # white behind the garment

    # Full-resolution print crop for texture density.
    crop = Image.open(result["crop"])
    assert max(crop.size) <= 2048
    assert min(crop.size) > 0


def test_render_reports_the_placement_it_achieved(tmp_path, real_back_plate):
    artwork = tmp_path / "art.png"
    Image.new("RGBA", (400, 200), (30, 30, 30, 255)).save(artwork)

    result = render(
        garment="hoodie", tone="white", view="back",
        artwork_path=artwork, method="screen",
        width_cm=28.0, drop_cm=22.0, offset_cm=0.0,
        out_dir=tmp_path,
    )

    assert result["achieved"]["width_cm"] == pytest.approx(28.0, abs=0.2)
    assert result["achieved"]["drop_cm"] == pytest.approx(22.0, abs=0.2)


def test_render_refuses_an_unknown_plate(tmp_path):
    artwork = tmp_path / "art.png"
    Image.new("RGBA", (100, 100), (0, 0, 0, 255)).save(artwork)
    with pytest.raises(Exception):
        render(
            garment="hoodie", tone="chartreuse", view="back",
            artwork_path=artwork, method="screen",
            width_cm=10.0, drop_cm=10.0, offset_cm=0.0,
            out_dir=tmp_path,
        )


def test_render_rejects_an_unknown_method(tmp_path, real_back_plate):
    artwork = tmp_path / "art.png"
    Image.new("RGBA", (100, 100), (0, 0, 0, 255)).save(artwork)
    with pytest.raises(ValueError):
        render(
            garment="hoodie", tone="white", view="back",
            artwork_path=artwork, method="woven",
            width_cm=10.0, drop_cm=10.0, offset_cm=0.0,
            out_dir=tmp_path,
        )
