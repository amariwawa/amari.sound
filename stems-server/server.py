#!/usr/bin/env python3
"""
amarisound stem server — splits audio into vocals / drums / bass / other with Meta's Demucs
(htdemucs). Binds to 127.0.0.1 only; nothing leaves the machine.

  GET  /health                 -> {"ok", "model", "device", "loaded"}
  POST /separate  (WAV body)   -> {"id", "stems": [...], "seconds"}   (44.1 kHz 16-bit PCM)
  GET  /stems/<id>/<name>.wav  -> separated stem
"""
import io
import json
import os
import shutil
import tempfile
import threading
import time
import uuid
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import torch
from demucs.apply import apply_model
from demucs.pretrained import get_model

HOST = "127.0.0.1"
PORT = int(os.environ.get("AMARI_STEMS_PORT", "8765"))
MODEL_NAME = os.environ.get("AMARI_STEMS_MODEL", "htdemucs")
MAX_SECONDS = 600
KEEP_JOBS = 8

OUT_DIR = tempfile.mkdtemp(prefix="amari-stems-")
_model = None
_model_lock = threading.Lock()
_run_lock = threading.Lock()
_device = "cpu"
_jobs = []


def load_model():
    global _model
    with _model_lock:
        if _model is None:
            m = get_model(MODEL_NAME)
            m.eval()
            _model = m
    return _model


def read_wav(data: bytes):
    with wave.open(io.BytesIO(data)) as w:
        ch, sr, width, n = w.getnchannels(), w.getframerate(), w.getsampwidth(), w.getnframes()
        if width != 2:
            raise ValueError("expected 16-bit PCM WAV")
        x = np.frombuffer(w.readframes(n), dtype="<i2").astype(np.float32) / 32768.0
    return x.reshape(-1, ch).T, sr


def write_wav(path: str, x: np.ndarray, sr: int):
    x = np.clip(x.T, -1.0, 1.0)
    with wave.open(path, "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((x * 32767.0).astype("<i2").tobytes())


def separate(x: np.ndarray, sr: int):
    global _device
    model = load_model()
    if sr != model.samplerate:
        raise ValueError(f"expected {model.samplerate} Hz audio, got {sr}")
    if x.shape[0] == 1:
        x = np.repeat(x, 2, axis=0)
    if x.shape[1] > MAX_SECONDS * sr:
        raise ValueError(f"sample too long (max {MAX_SECONDS // 60} min)")
    wav = torch.from_numpy(np.ascontiguousarray(x))
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    wav = (wav - mean) / std
    devices = ["mps", "cpu"] if torch.backends.mps.is_available() else ["cpu"]
    last = None
    for dev in devices:
        try:
            with torch.no_grad():
                out = apply_model(model, wav[None], device=dev, split=True, overlap=0.25, progress=False)[0]
            _device = dev
            out = out * std + mean
            return {name: out[i].cpu().numpy() for i, name in enumerate(model.sources)}
        except Exception as e:  # mps can lack ops on some versions -> fall back to cpu
            last = e
    raise last


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[stems]", fmt % args)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            dev = "mps" if torch.backends.mps.is_available() else "cpu"
            return self._json(200, {"ok": True, "model": MODEL_NAME, "device": _device if _model else dev, "loaded": _model is not None})
        parts = self.path.strip("/").split("/")
        if len(parts) == 3 and parts[0] == "stems":
            jid, fname = parts[1], parts[2]
            if not all(c.isalnum() or c in "-_." for c in jid + fname):
                return self._json(400, {"error": "bad path"})
            path = os.path.join(OUT_DIR, jid, fname)
            if not os.path.isfile(path):
                return self._json(404, {"error": "not found"})
            with open(path, "rb") as f:
                data = f.read()
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/separate":
            return self._json(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            x, sr = read_wav(self.rfile.read(n))
            t = time.time()
            with _run_lock:
                stems = separate(x, sr)
            jid = uuid.uuid4().hex[:12]
            d = os.path.join(OUT_DIR, jid)
            os.makedirs(d)
            for name, audio in stems.items():
                write_wav(os.path.join(d, f"{name}.wav"), audio, sr)
            _jobs.append(d)
            while len(_jobs) > KEEP_JOBS:
                shutil.rmtree(_jobs.pop(0), ignore_errors=True)
            secs = time.time() - t
            print(f"[stems] {x.shape[1] / sr:.1f}s audio -> {list(stems)} in {secs:.1f}s on {_device}")
            self._json(200, {"id": jid, "stems": list(stems), "seconds": secs})
        except Exception as e:
            self._json(500, {"error": str(e)})


if __name__ == "__main__":
    threading.Thread(target=load_model, daemon=True).start()
    print(f"[stems] amarisound stem server on http://{HOST}:{PORT}  (model {MODEL_NAME})")
    try:
        ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        shutil.rmtree(OUT_DIR, ignore_errors=True)
