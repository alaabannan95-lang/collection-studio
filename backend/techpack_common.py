"""
Shared SOAP tech-pack drawing primitives (chrome, typography, size-chart
table), extracted from build_techpack_apparel.py / build_techpack_jacket.py
so the dynamic Studio export (techpack_render.py) uses the exact same
visual language as the existing pro tech packs in assets/techpack/, without
touching those working scripts.
"""

import os
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import Color

# Paths are env-overridable so the same render code runs both on Alaa's Mac
# (defaults below, unchanged) and in the cloud backend (backend/app.py sets
# SOAP_ROOT / SOAP_LOGO / SOAP_FONT_DIR to the bundled copies).
ROOT = Path(os.environ.get("SOAP_ROOT", "/Users/alaabannan/Documents/Story Of A Pilgrim"))
LOGO = Path(os.environ.get("SOAP_LOGO", ROOT / "assets/Logos/logo.png"))

# Default font locations on the Mac. When SOAP_FONT_DIR is set, each font is
# loaded from that directory by the basenames listed below instead.
_FONT_FILES = {
    "Shrikhand":           "Shrikhand-Regular.ttf",
    "RobotoCond":          "RobotoCondensed-Regular.ttf",
    "RobotoCondMed":       "RobotoCondensed-Medium.ttf",
    "RobotoCondBold":      "RobotoCondensed-Bold.ttf",
    "RobotoCondItalic":    "RobotoCondensed-Italic.ttf",
    "RobotoCondMedItalic": "RobotoCondensed-MediumItalic.ttf",
    "Roboto":              "Roboto-Regular.ttf",
    "RobotoBold":          "Roboto-Bold.ttf",
    "RobotoItalic":        "Roboto-Italic.ttf",
}
_MAC_FONT_PATHS = {
    "Shrikhand":           "/Users/alaabannan/Library/Fonts/Shrikhand-Regular.ttf",
    "RobotoCond":          "/Users/alaabannan/Downloads/Roboto_Condensed/static/RobotoCondensed-Regular.ttf",
    "RobotoCondMed":       "/Users/alaabannan/Downloads/Roboto_Condensed/static/RobotoCondensed-Medium.ttf",
    "RobotoCondBold":      "/Users/alaabannan/Downloads/Roboto_Condensed/static/RobotoCondensed-Bold.ttf",
    "RobotoCondItalic":    "/Users/alaabannan/Downloads/Roboto_Condensed/static/RobotoCondensed-Italic.ttf",
    "RobotoCondMedItalic": "/Users/alaabannan/Downloads/Roboto_Condensed/static/RobotoCondensed-MediumItalic.ttf",
    "Roboto":              "/Users/alaabannan/Downloads/Roboto/static/Roboto-Regular.ttf",
    "RobotoBold":          "/Users/alaabannan/Downloads/Roboto/static/Roboto-Bold.ttf",
    "RobotoItalic":        "/Users/alaabannan/Downloads/Roboto/static/Roboto-Italic.ttf",
}
_font_dir = os.environ.get("SOAP_FONT_DIR")
if _font_dir:
    FONTS = {name: str(Path(_font_dir) / fn) for name, fn in _FONT_FILES.items()}
else:
    FONTS = dict(_MAC_FONT_PATHS)
_registered = False
def register_fonts():
    global _registered
    if _registered:
        return
    for name, path in FONTS.items():
        pdfmetrics.registerFont(TTFont(name, path))
    _registered = True

CREAM    = Color(0xF9/255, 0xF5/255, 0xED/255)
INK      = Color(0x2A/255, 0x2A/255, 0x2A/255)
CHARCOAL = Color(0x6B/255, 0x6B/255, 0x6B/255)
MIDGREY  = Color(0xAA/255, 0xAA/255, 0xAA/255)
SIGNAL   = Color(0x7F/255, 0x03/255, 0x04/255)
HAIRLINE = INK

PAGE_W, PAGE_H = A4
M = 36
HEADER_H = 117
TITLE_BAND_H = 64
FOOTER_H = 36
CONTENT_TOP = PAGE_H - M - HEADER_H - TITLE_BAND_H
CONTENT_BOTTOM = M + FOOTER_H
CONTENT_W = PAGE_W - 2 * M
CONTENT_H = CONTENT_TOP - CONTENT_BOTTOM


def hline(c, x1, y, x2, w=0.4, color=HAIRLINE):
    c.setStrokeColor(color); c.setLineWidth(w); c.line(x1, y, x2, y)

def vline(c, x, y1, y2, w=0.4, color=HAIRLINE):
    c.setStrokeColor(color); c.setLineWidth(w); c.line(x, y1, x, y2)

def tracked(c, text, x, y, font, size, color, tracking=1.4):
    c.setFont(font, size); c.setFillColor(color)
    cur = x
    for ch in text:
        c.drawString(cur, y, ch)
        cur += c.stringWidth(ch, font, size) + tracking

def text_width_tracked(c, text, font, size, tracking=1.4):
    w = sum(pdfmetrics.stringWidth(ch, font, size) for ch in text)
    return w + tracking * max(len(text) - 1, 0)


def draw_header(c, spec):
    y_top = PAGE_H - M
    logo_box = 52
    try:
        c.drawImage(str(LOGO), M, y_top - logo_box, width=logo_box, height=logo_box,
                    preserveAspectRatio=True, mask='auto', anchor='nw')
    except Exception:
        c.setFont("Shrikhand", 22); c.setFillColor(INK)
        c.drawString(M, y_top - 22, "SOAP")

    grid_x = M + 110
    grid_w = PAGE_W - M - grid_x
    rows = [
        ("SEASON",     spec["season"]),
        ("COLLECTION", spec["collection"]),
        ("PRODUCT",    spec["product_name"]),
        ("REF NO.",    spec["product_number"]),
        ("CATEGORY",   spec["category"]),
        ("DATE",       spec["date"]),
        ("FABRIC",     spec.get("fabric") or ""),
        ("GSM",        spec.get("gsm") or ""),
        ("WASH",       spec.get("wash") or ""),
    ]
    cols = 3
    rows_n = 3
    cell_w = grid_w / cols
    cell_h = HEADER_H / rows_n
    grid_top = y_top
    grid_bot = y_top - HEADER_H
    c.setStrokeColor(HAIRLINE); c.setLineWidth(0.4)
    c.rect(grid_x, grid_bot, grid_w, HEADER_H, stroke=1, fill=0)
    for i in range(1, cols):
        vline(c, grid_x + i * cell_w, grid_bot, grid_top)
    for r in range(1, rows_n):
        hline(c, grid_x, grid_bot + r * cell_h, grid_x + grid_w)

    for idx, (label, value) in enumerate(rows):
        col = idx % cols
        row = idx // cols
        cx = grid_x + col * cell_w + 8
        cy_top = grid_top - row * cell_h
        tracked(c, label, cx, cy_top - 14, "RobotoCondItalic", 6.6, CHARCOAL, tracking=1.2)
        c.setFont("RobotoCondMed", 11); c.setFillColor(INK)
        c.drawString(cx, cy_top - cell_h + 10, str(value))


def draw_title_band(c, num, total, title, sub):
    y_band_top = PAGE_H - M - HEADER_H - 14
    y_band_bot = y_band_top - TITLE_BAND_H + 14
    hline(c, M, y_band_top, PAGE_W - M, w=0.6)
    hline(c, M, y_band_bot, PAGE_W - M, w=0.4, color=MIDGREY)
    tracked(c, f"SECTION {num:02d} / {total:02d}", M, y_band_top - 16,
            "RobotoCondItalic", 7.5, SIGNAL, tracking=1.8)
    c.setFont("Shrikhand", 26); c.setFillColor(INK)
    c.drawString(M, y_band_bot + 8, title)
    sub_text = sub.upper()
    sub_w = text_width_tracked(c, sub_text, "RobotoCondItalic", 7.5, 1.6)
    tracked(c, sub_text, PAGE_W - M - sub_w, y_band_top - 16,
            "RobotoCondItalic", 7.5, CHARCOAL, tracking=1.6)


def draw_footer(c, num, total, season_tag):
    y_line = M + FOOTER_H - 6
    hline(c, M, y_line, PAGE_W - M, w=0.4, color=MIDGREY)
    base = M + 8
    tracked(c, "STORY OF A PILGRIM", M, base, "RobotoCondItalic", 7, INK, tracking=1.8)
    centerword = "BREATHE"
    cw = text_width_tracked(c, centerword, "RobotoCondItalic", 7, 2.4)
    tracked(c, centerword, (PAGE_W - cw) / 2, base, "RobotoCondItalic", 7, SIGNAL, tracking=2.4)
    right = f"{num:02d} / {total:02d}   ·   {season_tag}"
    rw = text_width_tracked(c, right, "RobotoCondItalic", 7, 1.4)
    tracked(c, right, PAGE_W - M - rw, base, "RobotoCondItalic", 7, INK, tracking=1.4)


def draw_description_strip(c, spec):
    y = CONTENT_TOP - 8
    label_w = 70
    tracked(c, "DESCRIPTION", M, y - 4, "RobotoCondItalic", 7, SIGNAL, tracking=1.6)
    text = spec["description"]
    font = "Roboto"; size = 9
    max_w = CONTENT_W - label_w - 10
    words = text.split()
    line = ""; lines = []
    for w in words:
        test = (line + " " + w).strip()
        if pdfmetrics.stringWidth(test, font, size) <= max_w:
            line = test
        else:
            lines.append(line); line = w
    if line:
        lines.append(line)
    c.setFont(font, size); c.setFillColor(INK)
    lh = 11
    for i, ln in enumerate(lines):
        c.drawString(M + label_w + 10, y - 4 - i * lh, ln)
    strip_bottom = y - 4 - (len(lines) - 1) * lh - 10
    hline(c, M, strip_bottom, PAGE_W - M, w=0.3, color=MIDGREY)
    return strip_bottom


def frame(c, num, total, title, sub, spec, season_tag):
    c.setFillColor(CREAM); c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    draw_header(c, spec)
    draw_title_band(c, num, total, title, sub)
    draw_footer(c, num, total, season_tag)
    return draw_description_strip(c, spec)


def image_placement_rect(img_path_or_image, area_x, area_y, area_w, area_h):
    """Same fit-centered math place_image_centered draws with, but returns
    (x, y, w, h, ratio) instead of drawing -- lets callers map pixel-space
    coordinates within that same source image into PDF point space (e.g.
    to overlay dimension lines on a print's own position)."""
    from PIL import Image as PILImage
    if isinstance(img_path_or_image, PILImage.Image):
        iw, ih = img_path_or_image.size
    else:
        with PILImage.open(img_path_or_image) as im:
            iw, ih = im.size
    ratio = min(area_w / iw, area_h / ih)
    w = iw * ratio
    h = ih * ratio
    x = area_x + (area_w - w) / 2
    y = area_y + (area_h - h) / 2
    return x, y, w, h, ratio


def place_image_centered(c, img_path_or_image, area_x, area_y, area_w, area_h):
    from PIL import Image as PILImage
    from reportlab.lib.utils import ImageReader
    x, y, w, h, ratio = image_placement_rect(img_path_or_image, area_x, area_y, area_w, area_h)
    src = ImageReader(img_path_or_image) if isinstance(img_path_or_image, PILImage.Image) else str(img_path_or_image)
    c.drawImage(src, x, y, width=w, height=h, preserveAspectRatio=True, mask='auto')


def draw_dim_mark(c, x1, y1, x2, y2, label, color=None, tick=4, font="RobotoCondMed", size=7.5, label_gap=6):
    """Axis-aligned dimension line from (x1,y1) to (x2,y2) with a small
    perpendicular end-tick at each end and a centered text label (rotated
    90 degrees for vertical marks) -- the same visual language as the red
    callout arrows in the original tech pack diagrams."""
    color = color or SIGNAL
    c.setStrokeColor(color); c.setLineWidth(0.6)
    c.line(x1, y1, x2, y2)
    horizontal = abs(x2 - x1) >= abs(y2 - y1)
    if horizontal:
        c.line(x1, y1 - tick, x1, y1 + tick)
        c.line(x2, y2 - tick, x2, y2 + tick)
    else:
        c.line(x1 - tick, y1, x1 + tick, y1)
        c.line(x2 - tick, y2, x2 + tick, y2)
    c.setFont(font, size); c.setFillColor(color)
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    tw = c.stringWidth(label, font, size)
    if horizontal:
        c.drawString(mx - tw / 2, my + label_gap, label)
    else:
        c.saveState()
        c.translate(mx, my)
        c.rotate(90)
        c.drawString(-tw / 2, label_gap, label)
        c.restoreState()


def draw_size_chart(c, top_y, bottom_y, headers, rows, note=None, keys=None):
    table_w = CONTENT_W
    x0 = M
    key_w = 22 if keys else 0
    name_w = 190 - key_w
    label_x0 = x0 + key_w
    size_col_w = (table_w - key_w - name_w) / len(headers)
    size_start_idx = 2 if keys else 1
    cols_x = [x0]
    if keys:
        cols_x.append(label_x0)
    cols_x.append(label_x0 + name_w)
    for i in range(len(headers)):
        cols_x.append(cols_x[-1] + size_col_w)

    rows_n = len(rows) + 1
    row_h = (top_y - bottom_y) / rows_n
    if row_h > 30:
        row_h = 30
    total_h = row_h * rows_n
    reserved = 34 if note else 0
    space_bot = bottom_y + reserved
    avail = top_y - space_bot
    y_top = space_bot + (avail + total_h) / 2
    y_bot = y_top - total_h

    c.setFillColor(Color(0.92, 0.90, 0.85))
    c.rect(x0, y_top - row_h, table_w, row_h, stroke=0, fill=1)

    c.setStrokeColor(HAIRLINE); c.setLineWidth(0.5)
    c.rect(x0, y_bot, table_w, total_h, stroke=1, fill=0)

    for r in range(1, rows_n):
        hline(c, x0, y_top - r * row_h, x0 + table_w, w=0.3, color=MIDGREY)
    for cx in cols_x[1:]:
        vline(c, cx, y_bot, y_top, w=0.3, color=MIDGREY)

    if keys:
        tracked(c, "KEY", x0 + 4, y_top - row_h + (row_h - 10) / 2,
                "RobotoCondItalic", 6.5, INK, tracking=1)
    tracked(c, "POINT OF MEASURE", label_x0 + 8, y_top - row_h + (row_h - 10) / 2,
            "RobotoCondItalic", 7.5, INK, tracking=1.4)
    for i, s in enumerate(headers):
        cx = cols_x[size_start_idx + i]
        c.setFont("RobotoCondBold", 11); c.setFillColor(INK)
        tw = c.stringWidth(s, "RobotoCondBold", 11)
        c.drawString(cx + (size_col_w - tw) / 2, y_top - row_h + (row_h - 10) / 2, s)

    label_avail_w = name_w - 14
    for r, (label, vals) in enumerate(rows, start=1):
        y = y_top - r * row_h - row_h / 2 - 3
        if keys:
            c.setFont("RobotoCondBold", 9.5); c.setFillColor(SIGNAL)
            c.drawString(x0 + 6, y, str(keys[r - 1]))
        # Long labels ("1/2 bottom opening, stretched, meas. on seam") can
        # exceed the label column at the default size and collide with the
        # first size column -- shrink just that row's font to fit instead.
        label_size = 9.5
        while label_size > 6.5 and c.stringWidth(label, "Roboto", label_size) > label_avail_w:
            label_size -= 0.5
        c.setFont("Roboto", label_size); c.setFillColor(INK)
        c.drawString(label_x0 + 8, y, label)
        for i, v in enumerate(vals):
            cx = cols_x[size_start_idx + i]
            disp = v if v else "-"
            c.setFont("Roboto", 9.5); c.setFillColor(INK if v else MIDGREY)
            tw = c.stringWidth(str(disp), "Roboto", 9.5)
            c.drawString(cx + (size_col_w - tw) / 2, y, str(disp))

    if note:
        note_y = y_bot - 18
        tracked(c, "NOTE", x0, note_y, "RobotoCondItalic", 7, SIGNAL, tracking=1.6)
        c.setFont("RobotoItalic", 9); c.setFillColor(CHARCOAL)
        c.drawString(x0 + 34, note_y, note)
