# Optional container build (host-agnostic fallback; Render uses render.yaml's
# native python runtime instead). Build from the REPO ROOT so the garment/seam
# art comes along:
#   docker build -f backend/Dockerfile -t collection-studio-techpack .
#   docker run -p 8000:8000 collection-studio-techpack
FROM python:3.12-slim

WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Whole repo: backend/ plus the assets/ the render code reads from repo root.
COPY . /app
WORKDIR /app/backend

ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:${PORT} --timeout 120"]
