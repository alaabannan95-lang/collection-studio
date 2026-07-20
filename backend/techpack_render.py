"""
Builds a factory-facing SOAP tech pack PDF from a Studio design payload
(garment spec + chosen color + print layers, as assembled by studio/app.js).

Reuses the exact chrome/typography/size-chart drawing from techpack_common.py
so this matches the existing pro tech packs in assets/techpack/. What's
dynamic per design:
  - Design page: body colorway + every print color used, each labeled with
    its locked Pantone name/code if it matches a brand swatch, otherwise
    flagged as a custom color needing a physical Pantone match.
  - Flat Drawing page: the real flat-drawing art (studio/assets/), recolored
    with the same multiply technique the browser preview uses, with each
    print layer composited at its exact position.
  - Print Placement page: every print layer's real centimetre placement
    drawn as dimension-line callouts directly on the flat art (matches the
    live readout in the Studio Print tab), title/subtitle reflect whichever
    method (Embroidery / Screen Print) was chosen for that design's prints.
  - Print Spec page: each print layer isolated (no garment silhouette) with
    its method, color/Pantone, exact size and placement -- a standalone
    sheet the manufacturer's print/embroidery line can work from directly.
  - Measurements page: the garment's own point-of-measure diagram, reused
    verbatim from that garment's authoritative source tech pack (assets/
    techpack/) via scripts/extract_pom_data.py -- this diagram is uncolored
    reference art, identical regardless of the design's custom colorway.
  - Size Chart page: the point-of-measure table, with the same lettered key
    column as the source doc when that garment has one (hoodie, jacket,
    crewneck -- see studio/data.js `pomKey`), otherwise the plain table.

Known V1 gap: the original tech packs' construction/stitch detail photos are
not reproduced here (static reference images not something the Studio
design state carries) -- this export covers what actually changes with a
custom design, not a full replacement of the static tech pack.
"""

import base64
import io
import json
from datetime import date, datetime
from pathlib import Path

import numpy as np
from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.colors import Color as RLColor

from techpack_common import (
    ROOT, CREAM, INK, CHARCOAL, MIDGREY, SIGNAL, HAIRLINE,
    PAGE_W, PAGE_H, M, CONTENT_W, CONTENT_BOTTOM,
    register_fonts, tracked, text_width_tracked, hline,
    frame, place_image_centered, image_placement_rect, draw_size_chart, draw_dim_mark,
)

import math
import os

# On the Mac this is the "Collection studio" folder under the project root.
# The cloud backend sets SOAP_STUDIO_DIR to its bundled copy of that folder.
STUDIO_DIR = Path(os.environ.get("SOAP_STUDIO_DIR", ROOT / "Collection studio"))
ASSETS = STUDIO_DIR / "assets"

TOTAL_PAGES = 7


def format_spec_date(iso_date):
    """Formats a 'YYYY-MM-DD' date (from the Studio's date override, which
    defaults to today but can be set manually) into the tech pack header's
    existing short style, e.g. "13 Jul '26". Falls back to today if the
    value is missing or malformed."""
    if iso_date:
        try:
            d = datetime.strptime(iso_date, "%Y-%m-%d").date()
        except ValueError:
            d = date.today()
    else:
        d = date.today()
    return d.strftime("%-d %b '%y")


def hex_to_rgb(hex_color):
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))


PANTONE_TCX_PATH = Path(__file__).parent / "pantone_tcx.json"
_pantone_tcx_cache = None


def load_pantone_tcx():
    """Lazily loads the ~2310-color Pantone Fashion/Home+Interiors (TCX)
    reference table (code -> {name, hex}), sourced from a community dataset
    (github.com/Margaret2/pantone-colors) since Pantone publishes no official
    hex<->TCX conversion. Used only to suggest the closest book color for an
    arbitrary custom hex -- never treated as an authoritative match."""
    global _pantone_tcx_cache
    if _pantone_tcx_cache is None:
        with open(PANTONE_TCX_PATH) as f:
            _pantone_tcx_cache = json.load(f)
    return _pantone_tcx_cache


def nearest_pantone_tcx(hex_color):
    """Finds the closest color in the TCX table to hex_color using the
    'redmean' weighted RGB distance (a cheap, well-known approximation of
    perceptual difference -- good enough to rank 2310 candidates without
    pulling in a full color-science dependency)."""
    r1, g1, b1 = hex_to_rgb(hex_color)
    best_code, best_name, best_hex, best_dist = None, None, None, float('inf')
    for code, entry in load_pantone_tcx().items():
        r2, g2, b2 = hex_to_rgb(entry['hex'])
        rmean = (r1 + r2) / 2
        dr, dg, db = r1 - r2, g1 - g2, b1 - b2
        dist = ((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db) ** 0.5
        if dist < best_dist:
            best_code, best_name, best_hex, best_dist = code, entry['name'], entry['hex'], dist
    return best_code, best_name, best_hex


def pantone_label(hex_color, brand_swatches):
    if not hex_color:
        return None
    for sw in brand_swatches:
        if sw['hex'].lower() == hex_color.lower():
            return f"{sw['name']} — {sw['pantone']}", False
    code, name, _ = nearest_pantone_tcx(hex_color)
    display_name = name.replace('-', ' ').title()
    return f"Nearest match (approx.) — {display_name}, {code} TCX", True


def decode_data_url(data_url):
    header, b64 = data_url.split(',', 1)
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert('RGBA')


def recolor_garment(png_path, hex_color):
    """Same multiply-blend recolor as the browser canvas: flat color fill
    clipped to the art's own alpha, with the original linework/shading
    multiplied on top -- equivalent, since both share one alpha footprint,
    to simply multiplying the original RGB by the chosen color per pixel."""
    img = Image.open(png_path).convert('RGBA')
    arr = np.array(img).astype(np.float32)
    rgb = arr[:, :, :3]
    alpha = arr[:, :, 3]
    color = np.array(hex_to_rgb(hex_color), dtype=np.float32)
    multiplied = np.clip((rgb * color) / 255.0, 0, 255)
    out = np.dstack([multiplied, alpha]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def tint_print(img, hex_color):
    """Flat stencil fill through the artwork's own alpha (single-ink screen
    print / embroidery thread color), same as the browser's source-atop fill."""
    arr = np.array(img.convert('RGBA')).astype(np.uint8)
    r, g, b = hex_to_rgb(hex_color)
    out = arr.copy()
    out[:, :, 0] = r
    out[:, :, 1] = g
    out[:, :, 2] = b
    return Image.fromarray(out, 'RGBA')


def composite_print(base, p):
    """Composite one print layer onto the recolored garment image. p carries
    final pixel geometry (cx, cy, w, h, rotation) already computed by the
    Studio app using its own calibration, so this file has no placement
    math of its own to drift out of sync with the browser preview."""
    img = decode_data_url(p['src'])
    if p.get('color'):
        img = tint_print(img, p['color'])
    w, h = max(1, int(round(p['w']))), max(1, int(round(p['h'])))
    resized = img.resize((w, h), Image.LANCZOS)
    opacity = p.get('opacity', 1)
    if opacity < 1:
        r, g, b, a = resized.split()
        a = a.point(lambda v: int(v * opacity))
        resized = Image.merge('RGBA', (r, g, b, a))
    rotation = p.get('rotation', 0)
    if rotation:
        resized = resized.rotate(-rotation, expand=True, resample=Image.BICUBIC)
    px = int(round(p['cx'] - resized.width / 2))
    py = int(round(p['cy'] - resized.height / 2))
    base.paste(resized, (px, py), resized)


def tint_white_to_cream(png_path):
    """Multiplies a white-background reference diagram (POM diagrams) by the
    page's own CREAM tone, same math as recolor_garment -- white*CREAM=CREAM,
    black stays black -- so the diagram blends into the page instead of
    sitting on it as a stark white box."""
    img = Image.open(png_path).convert('RGBA')
    arr = np.array(img).astype(np.float32)
    rgb = arr[:, :, :3]
    alpha = arr[:, :, 3]
    cream = np.array([0xF9, 0xF5, 0xED], dtype=np.float32)
    multiplied = np.clip((rgb * cream) / 255.0, 0, 255)
    out = np.dstack([multiplied, alpha]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def build_view_image(assetKey, view, color, prints):
    png_path = ASSETS / f"{assetKey}_{view}.png"
    img = recolor_garment(png_path, color)
    for p in prints:
        if p['view'] == view:
            composite_print(img, p)
    return img


# ---------- pages ----------

def draw_design_page(c, spec, season_tag, garment, color, prints, brand_swatches):
    strip_bottom = frame(c, 1, TOTAL_PAGES, "Design", "Colorway, Pantone references", spec, season_tag)
    top = strip_bottom - 30
    x = M
    swatch = 70
    gap = 26
    row_h = 96

    entries = [("Body", color)]
    seen = {color.lower()}
    for p in prints:
        if p.get('color') and p['color'].lower() not in seen:
            entries.append((f"Print — {p['name']} ({p['view']})", p['color']))
            seen.add(p['color'].lower())
        elif not p.get('color'):
            entries.append((f"Print — {p['name']} ({p['view']})", None))

    y = top
    for label, hexval in entries:
        if y - row_h < CONTENT_BOTTOM:
            break
        if hexval:
            r, g, b = hex_to_rgb(hexval)
            c.setFillColor(RLColor(r / 255, g / 255, b / 255))
            c.setStrokeColor(HAIRLINE); c.setLineWidth(0.6)
            c.rect(x, y - swatch, swatch, swatch, stroke=1, fill=1)
            text_x = x + swatch + 18
            pantone_text, is_custom = pantone_label(hexval, brand_swatches)
        else:
            c.setStrokeColor(HAIRLINE); c.setLineWidth(0.6)
            c.rect(x, y - swatch, swatch, swatch, stroke=1, fill=0)
            tracked(c, "MULTI", x + 18, y - swatch / 2 - 3, "RobotoCondItalic", 7, CHARCOAL, tracking=1)
            text_x = x + swatch + 18
            pantone_text, is_custom = "Original artwork colors (not a single spot color)", False

        c.setFont("RobotoCondBold", 13); c.setFillColor(INK)
        c.drawString(text_x, y - 22, label)
        c.setFont("Roboto", 10)
        c.setFillColor(SIGNAL if is_custom else CHARCOAL)
        c.drawString(text_x, y - 38, pantone_text)
        if hexval:
            c.setFont("Roboto", 8.5); c.setFillColor(MIDGREY)
            c.drawString(text_x, y - 52, f"hex {hexval.upper()} (screen approximate)")

        y -= row_h

    c.showPage()


def draw_flat_drawing_page(c, spec, season_tag, garment, color, prints):
    strip_bottom = frame(c, 2, TOTAL_PAGES, "Flat Drawing", "Custom colorway, front and back", spec, season_tag)
    content_top = strip_bottom - 12
    content_bot = CONTENT_BOTTOM + 6

    half_w = CONTENT_W / 2 - 10
    label_h = 20

    front_img = build_view_image(garment['assetKey'], 'front', color, prints)
    back_img = build_view_image(garment['assetKey'], 'back', color, prints)

    tracked(c, "FRONT", M, content_top - 4, "RobotoCondItalic", 8, SIGNAL, tracking=1.6)
    tracked(c, "BACK", M + half_w + 20, content_top - 4, "RobotoCondItalic", 8, SIGNAL, tracking=1.6)

    place_image_centered(c, front_img, M, content_bot, half_w, content_top - content_bot - label_h)
    place_image_centered(c, back_img, M + half_w + 20, content_bot, half_w, content_top - content_bot - label_h)

    c.showPage()


def placement_page_title(prints):
    methods = {p.get('method', 'embroidery') for p in prints}
    if not prints:
        return "Placement", "Print / embroidery placement, front and back"
    if methods == {'embroidery'}:
        return "Embroidery", "Embroidery placement, front and back"
    if methods == {'screen'}:
        return "Screen Print", "Screen print placement, front and back"
    return "Placement", "Print / embroidery placement, front and back"


def draw_placement_page(c, spec, season_tag, garment, color, prints, calib):
    title, sub = placement_page_title(prints)
    strip_bottom = frame(c, 3, TOTAL_PAGES, title, sub, spec, season_tag)
    content_top = strip_bottom - 12
    content_bot = CONTENT_BOTTOM + 6
    label_h = 20
    note_h = 24
    area_h = content_top - content_bot - label_h - note_h

    half_w = CONTENT_W / 2 - 10
    for i, view in enumerate(['front', 'back']):
        area_x = M if i == 0 else M + half_w + 20
        tracked(c, view.upper(), area_x, content_top - 4, "RobotoCondItalic", 8, SIGNAL, tracking=1.6)

        # Same recolor + print compositing as the Flat Drawing page -- the
        # print artwork itself is drawn here too, so the dimension marks
        # below sit directly on top of it, not on a bare garment.
        img = build_view_image(garment['assetKey'], view, color, prints)
        area_y = content_bot + note_h
        img_x, img_y, img_w, img_h, ratio = image_placement_rect(img, area_x, area_y, half_w, area_h)
        place_image_centered(c, img, area_x, area_y, half_w, area_h)

        vcalib = calib.get(view) if calib else None
        for p in prints:
            if p['view'] != view:
                continue
            # Pixel space is top-down (image origin at top-left); PDF point
            # space is bottom-up -- flip Y through the placed image's own height.
            cx_pdf = img_x + p['cx'] * ratio
            cy_pdf = img_y + img_h - p['cy'] * ratio
            w_pdf = p['w'] * ratio
            h_pdf = p['h'] * ratio

            method_label = 'SCREEN PRINT' if p.get('method') == 'screen' else 'EMBROIDERY'
            tracked(c, method_label, cx_pdf - w_pdf / 2, cy_pdf + h_pdf / 2 + 34,
                    "RobotoCondItalic", 6.5, SIGNAL, tracking=1.2)

            # Width bracket just above the print. Sized from the artwork's
            # own pre-rotation width (the tech-pack convention) rather than
            # its rotated on-screen bounding box -- a rotated print will
            # still show its true width here, not a wider/narrower AABB.
            draw_dim_mark(c, cx_pdf - w_pdf / 2, cy_pdf + h_pdf / 2 + 12,
                          cx_pdf + w_pdf / 2, cy_pdf + h_pdf / 2 + 12,
                          f"{p['widthCm']:.1f} cm")

            if vcalib:
                hsp_y_pdf = img_y + img_h - vcalib['hspY'] * ratio
                leader_x = cx_pdf - w_pdf / 2 - 14
                draw_dim_mark(c, leader_x, hsp_y_pdf, leader_x, cy_pdf + h_pdf / 2,
                              f"top {p['belowCollarCm']:.1f} cm below collar")

                center_x_pdf = img_x + vcalib['centerX'] * ratio
                leader_y = cy_pdf - h_pdf / 2 - 14
                side = 'right' if p['fromCenterCm'] >= 0 else 'left'
                draw_dim_mark(c, center_x_pdf, leader_y, cx_pdf, leader_y,
                              f"{abs(p['fromCenterCm']):.1f} cm {side} of CF")

    note_y = content_bot + 6
    if not prints:
        c.setFont("RobotoItalic", 10); c.setFillColor(CHARCOAL)
        c.drawString(M, note_y, "No print or embroidery placed on this design.")
    else:
        tracked(c, "NOTE", M, note_y, "RobotoCondItalic", 7, SIGNAL, tracking=1.6)
        c.setFont("RobotoItalic", 9); c.setFillColor(CHARCOAL)
        c.drawString(M + 34, note_y, "Vertical placement measured from HSP (high shoulder point / collar) to the highest point of the print. Horizontal from garment centerline.")
    c.showPage()


def draw_print_spec_page(c, spec, season_tag, prints, brand_swatches):
    """Standalone print/embroidery spec sheet: each artwork shown isolated
    (no garment silhouette) with its method, color, and exact size and
    placement -- everything the manufacturer's print/embroidery line needs,
    without having to cross-reference the full garment pages."""
    strip_bottom = frame(c, 4, TOTAL_PAGES, "Print Spec", "Isolated artwork, ready for production", spec, season_tag)
    content_top = strip_bottom - 12
    content_bot = CONTENT_BOTTOM + 6

    if not prints:
        c.setFont("RobotoItalic", 11); c.setFillColor(CHARCOAL)
        c.drawString(M, content_top - 30, "No print or embroidery on this design.")
        c.showPage()
        return

    ordered = sorted(prints, key=lambda p: p['view'] != 'front')
    card_h = 130
    img_box = 100
    gap = 14
    y = content_top

    for p in ordered:
        if y - card_h < content_bot:
            break
        card_top = y
        card_bot = y - card_h
        c.setStrokeColor(HAIRLINE); c.setLineWidth(0.6)
        c.rect(M, card_bot, CONTENT_W, card_h, stroke=1, fill=0)

        img = decode_data_url(p['src'])
        if p.get('color'):
            img = tint_print(img, p['color'])
        img_x = M + 14
        img_y = card_bot + (card_h - img_box) / 2
        place_image_centered(c, img, img_x, img_y, img_box, img_box)

        text_x = img_x + img_box + 24
        text_top = card_top - 20

        method_label = 'SCREEN PRINTING' if p.get('method') == 'screen' else 'EMBROIDERY'
        tracked(c, method_label, text_x, text_top, "RobotoCondItalic", 7.5, SIGNAL, tracking=1.6)

        c.setFont("RobotoCondBold", 13); c.setFillColor(INK)
        c.drawString(text_x, text_top - 20, f"{p['name']} — {p['view'].upper()}")

        if p.get('color'):
            pantone_text, is_custom = pantone_label(p['color'], brand_swatches)
        else:
            pantone_text, is_custom = "Original artwork colors (not a single spot color)", False
        c.setFont("Roboto", 9.5); c.setFillColor(SIGNAL if is_custom else CHARCOAL)
        c.drawString(text_x, text_top - 38, pantone_text)

        c.setFont("Roboto", 9); c.setFillColor(INK)
        c.drawString(text_x, text_top - 56, f"{p['widthCm']:.1f} × {p.get('heightCm', 0):.1f} cm")

        side = 'right' if p['fromCenterCm'] >= 0 else 'left'
        placement = f"{p['belowCollarCm']:.1f} cm below collar · {abs(p['fromCenterCm']):.1f} cm {side} of center"
        c.setFont("Roboto", 8.5); c.setFillColor(CHARCOAL)
        c.drawString(text_x, text_top - 72, placement)

        y -= card_h + gap

    c.showPage()


def _arrowhead(c, x, y, angle, size=5.5, color=SIGNAL):
    """Filled triangle at (x, y) pointing along `angle` (radians)."""
    c.setFillColor(color)
    left = angle + math.radians(152)
    right = angle - math.radians(152)
    p = c.beginPath()
    p.moveTo(x, y)
    p.lineTo(x + size * math.cos(left), y + size * math.sin(left))
    p.lineTo(x + size * math.cos(right), y + size * math.sin(right))
    p.close()
    c.drawPath(p, fill=1, stroke=0)


def draw_leader(c, x1, y1, x2, y2, color=SIGNAL):
    """Red callout line from a thumbnail edge (x1,y1) to a construction point
    (x2,y2) with an arrowhead landing on the part -- same visual language as
    the red leader arrows in the original tech pack construction pages."""
    c.setStrokeColor(color); c.setLineWidth(0.8)
    c.line(x1, y1, x2, y2)
    _arrowhead(c, x2, y2, math.atan2(y2 - y1, x2 - x1), color=color)


def _wrap_lines(c, text, font, size, max_w):
    words = text.split()
    line, lines = "", []
    for w in words:
        test = (line + " " + w).strip()
        if c.stringWidth(test, font, size) <= max_w or not line:
            line = test
        else:
            lines.append(line); line = w
    if line:
        lines.append(line)
    return lines


def draw_seam_finish_page(c, spec, season_tag, garment, color, seam_parts, seam_finishes):
    """Front flat drawing with a red callout arrow from each construction
    point out to a seam-finish reference photo + label, mirroring the
    factory construction pages (e.g. the jacket tech pack's stitch page)."""
    strip_bottom = frame(c, 5, TOTAL_PAGES, "Seam Finish", "Construction points, front", spec, season_tag)
    content_top = strip_bottom - 12
    content_bot = CONTENT_BOTTOM + 6

    fin_by_id = {f['id']: f for f in (seam_finishes or [])}

    if not seam_parts:
        c.setFont("RobotoItalic", 11); c.setFillColor(CHARCOAL)
        c.drawString(M, content_top - 30, "No seam map defined for this silhouette.")
        c.showPage()
        return

    side_col = 118.0
    gap = 16.0
    thumb_w = side_col
    thumb_h = 80.0
    label_h = 14.0
    desc_h = 28.0
    block_h = label_h + thumb_h + desc_h

    center_x0 = M + side_col + gap
    center_x1 = PAGE_W - M - side_col - gap
    center_w = center_x1 - center_x0

    # Front flat art, recolored to the design's body color (no prints -- this
    # page is about construction, not graphics).
    img = build_view_image(garment['assetKey'], 'front', color, [])
    img_x, img_y, img_w, img_h, ratio = image_placement_rect(img, center_x0, content_bot, center_w, content_top - content_bot)
    place_image_centered(c, img, center_x0, content_bot, center_w, content_top - content_bot)

    def anchor_pdf(part):
        a = part.get('anchor', {'x': 0.5, 'y': 0.5})
        return img_x + a['x'] * img_w, img_y + (1 - a['y']) * img_h

    left_parts = [p for p in seam_parts if p.get('side') != 'right']
    right_parts = [p for p in seam_parts if p.get('side') == 'right']

    def layout_side(parts, col_x, inner_edge_x):
        n = len(parts)
        if not n:
            return
        cell_h = (content_top - content_bot) / n
        for i, part in enumerate(parts):
            cell_top = content_top - i * cell_h
            block_top = cell_top - (cell_h - block_h) / 2
            fin = fin_by_id.get(part.get('finish')) or {}

            # Part label (red caps) above the reference photo.
            tracked(c, part.get('label', '').upper(), col_x, block_top - 9,
                    "RobotoCondItalic", 7, SIGNAL, tracking=1.2)

            thumb_top = block_top - label_h
            thumb_bot = thumb_top - thumb_h
            img_path = STUDIO_DIR / fin['img'] if fin.get('img') else None
            if img_path and img_path.exists():
                place_image_centered(c, str(img_path), col_x, thumb_bot, thumb_w, thumb_h)
            c.setStrokeColor(HAIRLINE); c.setLineWidth(0.6)
            c.rect(col_x, thumb_bot, thumb_w, thumb_h, stroke=1, fill=0)

            # Finish name + short note under the photo.
            c.setFont("RobotoCondBold", 8.5); c.setFillColor(INK)
            c.drawString(col_x, thumb_bot - 9, fin.get('name', ''))
            desc_lines = _wrap_lines(c, fin.get('desc', ''), "RobotoItalic", 6.8, side_col)[:2]
            c.setFont("RobotoItalic", 6.8); c.setFillColor(CHARCOAL)
            for j, ln in enumerate(desc_lines):
                c.drawString(col_x, thumb_bot - 18 - j * 9, ln)

            ax, ay = anchor_pdf(part)
            draw_leader(c, inner_edge_x, (thumb_top + thumb_bot) / 2, ax, ay)

    layout_side(left_parts, M, M + side_col)
    layout_side(right_parts, PAGE_W - M - side_col, PAGE_W - M - side_col)

    c.showPage()


def draw_pom_diagram_page(c, spec, season_tag, garment):
    strip_bottom = frame(c, 6, TOTAL_PAGES, "Measurements", "Point-of-measure key, flat callouts", spec, season_tag)
    content_top = strip_bottom - 12
    content_bot = CONTENT_BOTTOM + 6
    png_path = ASSETS / f"{garment['assetKey']}_pom.png"
    if png_path.exists():
        img = tint_white_to_cream(png_path)
        place_image_centered(c, img, M, content_bot, CONTENT_W, content_top - content_bot)
    else:
        # Degrade gracefully rather than 500 the export if a garment's
        # diagram was never extracted via scripts/extract_pom_data.py.
        c.setFont("RobotoItalic", 11); c.setFillColor(CHARCOAL)
        c.drawString(M, content_top - 30, "Point-of-measure diagram not available for this garment.")
    c.showPage()


def draw_size_chart_page(c, spec, season_tag, garment):
    strip_bottom = frame(c, 7, TOTAL_PAGES, "Size Chart", "Grade rule, centimetres", spec, season_tag)
    content_top = strip_bottom - 12
    content_bot = CONTENT_BOTTOM + 6
    pomkey = garment.get('pomKey')
    if pomkey and pomkey.get('rows'):
        headers = pomkey['headers']
        rows = [(r['label'], [r['values'].get(h, '') for h in headers]) for r in pomkey['rows']]
        keys = [r.get('key', '') for r in pomkey['rows']]
    else:
        headers = list(garment['sizes'].keys())
        rows = [(row['label'], [row.get(h, '') for h in headers]) for row in garment['pom']]
        keys = None
    draw_size_chart(c, content_top, content_bot, headers, rows, note=garment.get('note'), keys=keys)
    c.showPage()


def build_custom_techpack(payload):
    register_fonts()
    garment = payload['garment']
    calib = payload['calibration']
    color = payload['color']
    size = payload['size']
    brand_swatches = payload['brandSwatches']
    prints = payload.get('prints', [])

    gsm = payload.get('gsm')
    fabric = payload.get('fabric') or garment.get('fabric') or ''
    season_full = 'F/W' if garment['season'] == 'FW26' else 'S/S'
    season_tag = f"{garment['season']} · 001"
    spec = {
        "season": f"{season_full} '{garment['season'][-2:]}",
        "collection": "001",
        "product_name": garment['name'],
        "product_number": payload.get('refNo') or garment['refNo'],
        "category": garment['category'],
        "date": format_spec_date(payload.get('date')),
        "gsm": f"{gsm} GSM" if gsm else "",
        "fabric": fabric,
        "wash": payload.get('wash') or "",
        "description": f"Studio custom design, size {size}. Body colorway and print/embroidery placement customized from the locked {garment['name']} spec.",
    }

    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"Story Of A Pilgrim — {garment['name']} — Custom Design")
    c.setAuthor("Story Of A Pilgrim")

    draw_design_page(c, spec, season_tag, garment, color, prints, brand_swatches)
    draw_flat_drawing_page(c, spec, season_tag, garment, color, prints)
    draw_placement_page(c, spec, season_tag, garment, color, prints, calib)
    draw_print_spec_page(c, spec, season_tag, prints, brand_swatches)
    draw_seam_finish_page(c, spec, season_tag, garment, color,
                          payload.get('seamParts', []), payload.get('seamFinishes', []))
    draw_pom_diagram_page(c, spec, season_tag, garment)
    draw_size_chart_page(c, spec, season_tag, garment)

    c.save()
    return buf.getvalue()
