#!/bin/sh
# One-time setup for the amarisound stem server (Demucs). Needs ~1 GB of disk.
set -e
cd "$(dirname "$0")"
PY=/usr/bin/python3   # macOS system Python 3.9 — supported by PyTorch
echo "→ creating virtual env in stems-server/.venv"
$PY -m venv .venv
.venv/bin/pip install --no-cache-dir --upgrade pip
echo "→ installing PyTorch + Demucs (this is the big download)"
.venv/bin/pip install --no-cache-dir "torch<2.9" "torchaudio<2.9" "demucs==4.0.1" "numpy<2.1"
echo "→ downloading the htdemucs model (~80 MB, Meta)"
.venv/bin/python -c "from demucs.pretrained import get_model; get_model('htdemucs'); print('model ready')"
echo "✓ stem server ready — start everything with: npm run dev (in ui/)"
