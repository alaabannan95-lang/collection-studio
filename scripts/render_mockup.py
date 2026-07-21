#!/usr/bin/env python3
"""
Render one mockup end to end and write the three files its two consumers need.

  transparent  RGBA PNG, 2048px, garment cut from its background. The best
               input for the try-on AI, which composites its own scene.
  shopify      white-background JPEG, the product image.
  crop         the print area at full resolution, so the try-on tool gets the
               stitch and ink texture at maximum density instead of scaled down.

Also returns the placement it achieved, in centimetres, as a check that what
was asked for is what landed.

Usage:
    python3 scripts/render_mockup.py assets/logo.png \\
        --view back --method embroidery --width-cm 28 --drop-cm 22
"""

import argparse
import sys
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from backend.mockup.compose import Placement, compose, place  # noqa: E402
from backend.mockup.template import load_template  # noqa: E402


def render(garment, tone, view, artwork_path, method,
           width_cm, drop_cm, offset_cm, out_dir):
    """Render a mockup, write its three files, and report the placement achieved."""
    template = load_template(garment, tone, view)
    artwork = Image.open(artwork_path).convert("RGBA")
    placement = Placement(width_cm=width_cm, drop_cm=drop_cm, offset_cm=offset_cm)

    rendered = compose(template, artwork, placement, method=method)

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = f"{garment}_{tone}_{view}_{method}"

    transparent_path = out_dir / f"{stem}_transparent.png"
    rendered.save(transparent_path)

    shopify_path = out_dir / f"{stem}_shopify.jpg"
    white = Image.new("RGB", rendered.size, (255, 255, 255))
    white.paste(rendered, mask=rendered.getchannel("A"))
    white.save(shopify_path, quality=95)

    # The print crop, from where the artwork actually landed.
    left, top, right, bottom = place(template, artwork, placement)
    pad = int(0.08 * (right - left))
    box = (max(left - pad, 0), max(top - pad, 0),
           min(right + pad, rendered.width), min(bottom + pad, rendered.height))
    crop_path = out_dir / f"{stem}_crop.png"
    white.crop(box).save(crop_path)

    ppc = template.calib.px_per_cm
    achieved = {
        "width_cm": (right - left) / ppc,
        "drop_cm": (top - template.calib.hsp_y) / ppc,
        "offset_cm": ((left + right) / 2 - template.calib.center_x) / ppc,
    }
    return {
        "transparent": transparent_path,
        "shopify": shopify_path,
        "crop": crop_path,
        "achieved": achieved,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("artwork", help="PNG to print, ideally with transparency")
    parser.add_argument("--garment", default="hoodie")
    parser.add_argument("--tone", default="white")
    parser.add_argument("--view", default="back", choices=["front", "back"])
    parser.add_argument("--method", default="screen", choices=["screen", "embroidery"])
    parser.add_argument("--width-cm", type=float, default=28.0)
    parser.add_argument("--drop-cm", type=float, default=22.0,
                        help="Collar (HSP) to the TOP of the print")
    parser.add_argument("--offset-cm", type=float, default=0.0)
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    out_dir = Path(args.out) if args.out else (REPO / "assets" / "mockup" / "_render")

    result = render(
        garment=args.garment, tone=args.tone, view=args.view,
        artwork_path=args.artwork, method=args.method,
        width_cm=args.width_cm, drop_cm=args.drop_cm, offset_cm=args.offset_cm,
        out_dir=out_dir,
    )

    a = result["achieved"]
    for key in ("transparent", "shopify", "crop"):
        print(f"  {key:12s} {result[key].relative_to(REPO)}")
    print(f"  asked for : {args.width_cm}cm wide, {args.drop_cm}cm below collar, "
          f"{args.offset_cm}cm off centre")
    print(f"  achieved  : {a['width_cm']:.2f}cm wide, {a['drop_cm']:.2f}cm below "
          f"collar, {a['offset_cm']:.2f}cm off centre")


if __name__ == "__main__":
    main()
