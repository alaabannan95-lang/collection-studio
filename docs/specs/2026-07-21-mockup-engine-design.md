# Collection Studio, Mockup Engine

Design, 2026-07-21. Approved by Alaa Bannan.

## Purpose

Turn the design state the Studio already holds (garment, colorway, artwork layers with centimetre-accurate placement, print method per layer, GSM, seams, size) into a photoreal garment image.

The output serves two consumers, and the second one drives every decision:

1. Shopify product images and Instagram.
2. **A separate try-on AI that puts the garment on a model.** The mockup is its input.

That second consumer makes this a *technical reference photo*, not brand content. Pure white background, flat neutral studio light, straight-on camera, no styling, no brand warmth. PRODUCT.md's "sunlit and warm" governs the storefront and explicitly does not govern these plates: any lighting baked in here fights the scene the try-on tool builds around the garment.

It also means print material must read unmistakably. Embroidery has to look like raised thread and screen print like matte ink sunk into the weave, so the downstream tool carries that distinction onto the model.

## Non-goals

- On-model rendering. The try-on tool does that.
- Any brand-styled or lifestyle output.
- Generating a fresh AI image per mockup. Non-repeatable images cannot honestly serve as product photography.

## Architecture

Three stages, each independently testable.

```
base plates (one-time)  →  derived maps (one-time)  →  render (per design)
```

### Stage 1: base plates

Photoreal blank garment photographs, AI-generated once on Replicate and then fixed assets. Never regenerated at runtime, so every mockup afterwards is deterministic and free.

Three tones per view so no colorway is ever tinted far from its base:

| Tone | Base | Covers |
|---|---|---|
| Light | Bright White | Bright White, Baby's Breath, Pastel Yellow, all creams, Light Grey |
| Mid | Quiet Shade grey | Quiet Shade, Mid Grey, Mint Sage, Powder Blue, Sky Blue |
| Dark | Navy Blazer | Navy Blazer, Burgundy, Classic Blue, Signal Red, Ink, Walnut, Charcoal |

Six plates per garment (3 tones x front/back) at 2048x2048.

**Status:** the white hoodie pair is complete and locked at `assets/mockup/base/hoodie_white_{front,back}.png`. The grey and navy tones, and the other six garments, are follow-on work using the same scripts.

Generation is `scripts/build_mockup_base.py` (`flux-1.1-pro-ultra`, `raw: true`). Retouch is `scripts/clean_mockup_base.py`. Hard-won constraints for both, which apply to every future plate:

- Never phrase an absent feature as a negation. "no drawcord", "no label" and "no logo" all made those things *more* likely to appear. State what is present instead ("bare fabric", "a plain finished band"). "invisible form" produced a literal visible mannequin.
- Per-view features belong in the per-view prompt, never the shared one. "kangaroo pocket" in the shared string put a pocket on the garment's back.
- Flux will not obey fine construction detail regardless of wording. It always adds a drawcord, and always runs the hood centre-back seam the full height when the real pattern has it on the lower half only. Budget a retouch pass rather than more generations.
- Generative inpainting is the wrong retouch tool: `flux-fill-pro` downscaled the whole 2048 plate to 1264 and redrew the cords instead of removing them. Deterministic local fill (harmonic/Laplace plus a weak grain transplant) works on smooth surfaces; structured geometry such as eyelets on a curved band edge needs a hand pass in Affinity Photo.

### Stage 2: derived maps

Computed from each plate by script, no AI, and cached beside it.

| Map | Contents | Used for |
|---|---|---|
| `alpha` | Garment cut from background | Compositing onto any background; the transparent export |
| `depth` | Fold geometry, high-pass of luminance | Warping artwork into the folds |
| `shade` | Low-frequency luminance | Making the print pick up the plate's own light and shadow |
| `mask` | Printable panel only | Stopping artwork running over hem rib, hood seam or pocket |
| `calibration` | `pxPerCm`, `hspY`, `centerX` | Exact centimetre placement |

`calibration` is the accuracy guarantee and mirrors the numbers already in `CALIBRATION` in `data.js`. `pxPerCm` is derived by matching the plate's chest width against the garment's real half-chest from the tech pack (61 cm on the hoodie, size M). Without it a "14 cm below the collar" placement is meaningless.

Cutting alpha on the white plate is the hard case: the front plate's background is pure white (255) against a white garment, so the cut must follow edges and contact shadow rather than colour. The back plate's background is light grey (~225) and separates trivially. This inconsistency is harmless precisely because the engine always cuts the garment out and composites onto its own background.

### Stage 3: render

Per layer, in order:

1. Rasterise the layer at export resolution (uploaded artwork or rendered text).
2. Position via `pxPerCm` / `hspY` / `centerX`.
3. Clip to `mask`.
4. Displace by `depth` so the artwork bends into every fold. This is the single strongest realism cue.
5. Material pass:
   - **Screen print:** soften edges ~1px, multiply the fabric weave through at ~8%, ink opacity ~92%.
   - **Embroidery:** build a normal map from the layer alpha, relief-light it from the plate's key direction, add stitch-direction noise, add a 2px contact shadow, dilate alpha ~1px for thread body.
6. Light response: multiply `shade` over the print, restore specular where the plate is bright.
7. Composite onto the plate.

Body recolour reuses the flats' own maths (`source-atop` fill then `multiply` of the original, as in `paintStage()`), at 16-bit.

### Where each stage runs

- **Final export: Python**, in `backend/`, new `POST /generate-mockup` alongside the existing tech-pack endpoint, reusing the same design payload shape. Python wins on displacement mapping and normal-map relief lighting (numpy/OpenCV, 16-bit).
- **Live preview: browser canvas**, steps 1 to 3 plus a `shade` multiply. No displacement, no material pass. Interactive while placing artwork.

Render's free plan sleeps after ~15 minutes, so the first export of a session costs a ~40s cold start. Acceptable for a deliberate export, which is why preview is local.

## Outputs

Every export produces three files, because the two consumers want different things:

| File | For |
|---|---|
| Transparent PNG, 2048px | The try-on AI, which composites its own background |
| White-background JPEG | Shopify product image |
| Print-area crop, full resolution | Maximum stitch and ink texture density for the try-on AI |

## Error handling

- **Missing plate** for the requested garment/view/tone: fail with a message naming the specific missing file, and fall back to the existing flat rendering rather than a broken image.
- **Backend unreachable or cold:** browser preview keeps working; export surfaces the reason.
- **Artwork below usable resolution:** warn with the actual effective DPI at the chosen print size *before* export, not after.
- **Missing calibration** for a plate: refuse to render rather than silently placing artwork at a guessed scale. A wrong placement that looks plausible is worse than no render, because it would reach the factory.

## Testing

- **Golden images.** Fixed design payloads render and are compared against approved reference PNGs with a perceptual diff threshold, so a change to the material pass cannot silently regress the rest.
- **Calibration test.** Assert that a print specified at 12 cm wide measures 12 cm on the plate, and that a 14 cm drop from the collar lands 14 cm below `hspY`. This is the property the factory depends on.
- **Alpha coverage test.** Assert the cut-out alpha has no holes inside the garment body and no background bleed, on both the white-on-white front and the grey-background back.
- **Visual check against the reference photography** before any plate is used commercially.

## Phasing

1. **Maps, calibration, cutout, and a placement-accurate composite** (logo on the back plate, shading only). Proves the measurement chain is correct. Judged on accuracy, not beauty.
2. **Displacement.** The point at which the eye starts believing it.
3. **Material pass.** Embroidery versus screen print, which is what the try-on AI needs.

Each phase ends in something Alaa can look at and judge before the next is built.

## Open item

Once physical samples arrive, plates must be checked against the real garment and corrected. A mockup that flatters beyond the actual piece causes returns and undercuts the specificity-as-proof principle the brand relies on in place of testimonials.
