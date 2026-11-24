#!/bin/sh
# One-time local setup for the amarisound stem server (Demucs on ONNX Runtime, ~150 MB).
set -e
cd "$(dirname "$0")"
PY=${PYTHON:-/usr/bin/python3}
[ -d .venv ] || $PY -m venv .venv
.venv/bin/pip install --no-cache-dir --upgrade pip
.venv/bin/pip install --no-cache-dir -r requirements.txt "uvicorn==0.32.1"
echo "✓ stem server ready — start everything with: npm run dev (in ui/)"
