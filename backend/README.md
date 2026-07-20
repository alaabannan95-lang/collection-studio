# Collection Studio — Tech Pack Export Backend

Flask service that turns a Studio design payload into a reportlab-built tech-pack
PDF and returns it as a file download. The static Studio frontend (GitHub Pages)
POSTs to `/generate-techpack`; this service answers with `application/pdf`.

## Endpoints
- `POST /generate-techpack` — JSON design payload in, PDF out.
- `GET /health` — returns `{"status":"ok"}` (Render health check).

## Self-contained
Bundles its own copy of the render code (`techpack_render.py`,
`techpack_common.py`), `pantone_tcx.json`, `fonts/`, and `logo.png`. Garment and
seam art are read from the repo root (`../assets`). Path env vars are set at the
top of `app.py` so the shared render code resolves everything relative to this
folder instead of a local Mac path (`SOAP_ROOT`, `SOAP_STUDIO_DIR`, `SOAP_LOGO`,
`SOAP_FONT_DIR`).

> Note: `techpack_render.py` and `techpack_common.py` here are deploy copies of
> the originals in the main project's `scripts/`. If you edit the render logic in
> `scripts/`, re-copy both files into this folder and redeploy.

## Run locally
```
cd backend
pip install -r requirements.txt
python3 app.py           # http://localhost:5001
```

## Deploy (Render.com)
Blueprint lives at repo root `render.yaml`. Render Dashboard → New → Blueprint →
pick the `collection-studio` repo → apply. Free plan; sleeps after ~15 min idle.
