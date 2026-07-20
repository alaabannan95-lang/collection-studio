"""
Cloud backend for the Collection Studio "Download Tech Pack" button.

The Studio frontend (static site on GitHub Pages) POSTs its current design
state here and gets a real reportlab-built PDF back as a file download.

Self-contained: bundles its own copy of the render code (techpack_render.py /
techpack_common.py), fonts, logo and pantone data, and reads the garment /
seam art from the repo it ships in. Path env vars are set below so the shared
render code resolves everything relative to this folder instead of Alaa's Mac.

Run locally:  python3 app.py            (listens on http://localhost:5001)
Production:   gunicorn app:app          (see Dockerfile / render.yaml)
"""

import os
import sys
import traceback
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent   # backend/
REPO = HERE.parent                        # repo root == the "Collection studio" folder

# When running on Alaa's Mac, also file each export into the project's tech pack
# folder (../assets/techpack, i.e. Story Of A Pilgrim/assets/techpack). That
# folder only exists locally, so on Render this is silently skipped.
TECHPACK_DIR = Path(os.environ.get("SOAP_TECHPACK_DIR", REPO.parent / "assets" / "techpack"))

# Point the shared render code at the bundled assets before importing it.
os.environ.setdefault("SOAP_ROOT", str(REPO))
os.environ.setdefault("SOAP_STUDIO_DIR", str(REPO))   # garment + seam art live in <repo>/assets
os.environ.setdefault("SOAP_LOGO", str(HERE / "logo.png"))
os.environ.setdefault("SOAP_FONT_DIR", str(HERE / "fonts"))

sys.path.insert(0, str(HERE))

from flask import Flask, request, Response, jsonify
from techpack_render import build_custom_techpack

app = Flask(__name__)


@app.after_request
def add_cors(resp):
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    # Let the browser read where a local run filed the PDF.
    resp.headers['Access-Control-Expose-Headers'] = 'X-Saved-Path'
    return resp


@app.route('/generate-techpack', methods=['POST', 'OPTIONS'])
def generate_techpack():
    if request.method == 'OPTIONS':
        return Response(status=204)
    try:
        payload = request.get_json(force=True)
        pdf_bytes = build_custom_techpack(payload)
        # Timestamped so a new export never overwrites an earlier one; matches
        # the frontend's naming (id-size-techpack-YYYY-MM-DD-HHMM.pdf).
        stamp = datetime.now().strftime('%Y-%m-%d-%H%M')
        filename = f"{payload['garment']['id']}-{payload['size']}-techpack-{stamp}.pdf"

        headers = {'Content-Disposition': f'attachment; filename="{filename}"'}
        # Local run only: also drop a copy into the project tech pack folder.
        if TECHPACK_DIR.parent.exists():
            try:
                TECHPACK_DIR.mkdir(parents=True, exist_ok=True)
                (TECHPACK_DIR / filename).write_bytes(pdf_bytes)
                headers['X-Saved-Path'] = f'assets/techpack/{filename}'
            except OSError:
                pass  # non-fatal: the download still succeeds

        return Response(pdf_bytes, mimetype='application/pdf', headers=headers)
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


@app.route('/', methods=['GET'])
def index():
    return jsonify({'service': 'collection-studio-techpack', 'status': 'ok'})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)
