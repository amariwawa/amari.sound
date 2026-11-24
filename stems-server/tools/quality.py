"""Chunked ONNX (4 s model, as the browser does it) vs official PyTorch Demucs (7.8 s) — per-stem SDR."""
import os, sys, wave
import numpy as np, torch
from demucs.pretrained import get_model
from demucs.apply import apply_model
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import separator
SR = 44100
CORE, CTX, XF = int(2.5 * SR), int(0.74 * SR), int(0.02 * SR)

def load(path):
    with wave.open(path) as w:
        sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(np.float32) / 32768
    t = np.arange(int(len(x) * SR / sr)) / SR
    y = np.interp(t, np.arange(len(x)) / sr, x).astype(np.float32)
    return np.stack([y, np.roll(y, 23)])

def chunked(x):
    n = x.shape[1]; out = {s: np.zeros_like(x) for s in separator.SOURCES}
    for s0 in range(0, n, CORE):
        e = min(n, s0 + CORE + (XF if s0 + CORE < n else 0))
        cl, cr = min(CTX, s0), min(CTX, n - e)
        res = separator.separate(x[:, s0 - cl:e + cr])
        for k, v in res.items():
            v = v[:, cl:v.shape[1] - cr]
            if s0 > 0:
                g = np.sin((np.arange(XF) + 0.5) / XF * np.pi / 2); h = np.cos((np.arange(XF) + 0.5) / XF * np.pi / 2)
                v = v.copy(); v[:, :XF] = out[k][:, s0:s0 + XF] * h + v[:, :XF] * g
            out[k][:, s0:e] = v
    return out

m = get_model("htdemucs")
for name in ["test_boombap_loop", "test_trap_loop"]:
    x = load(f"/Users/macbookair/daw.vst/test-samples/{name}.wav")
    with torch.no_grad():
        ref = apply_model(m, torch.from_numpy(x)[None], split=True, overlap=0.25, progress=False)[0].numpy()
    ours = chunked(x)
    row = []
    for i, s in enumerate(m.sources):
        r = ref[i]; e = ours[s] - r
        energy = 10 * np.log10((r ** 2).mean() + 1e-12)
        sdr = 10 * np.log10((r ** 2).sum() / ((e ** 2).sum() + 1e-12)) if energy > -50 else float('nan')
        row.append(f"{s} {sdr:5.1f} dB" if energy > -50 else f"{s} (empty)")
    print(f"{name:18s} SDR vs official Demucs: " + " · ".join(row))
