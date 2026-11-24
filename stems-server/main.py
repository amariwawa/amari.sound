"""
amarisound stem API (FastAPI) — runs locally (uvicorn, port 8765) and on Vercel (service "stems").

  GET  /api/health
  POST /api/stems?ctx_l=<samples>&ctx_r=<samples>
       body: raw little-endian int16, interleaved stereo, 44.1 kHz, <= 7.8 s (incl. context)
       returns: application/octet-stream — the 4 stems (X-Stems order), each int16 interleaved
                stereo, with ctx_l/ctx_r context samples trimmed off; X-Frames = frames per stem.

Chunks stay small (~1.2 MB in, ~3.6 MB out) to fit serverless request/response limits.
"""
import numpy as np
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware

import separator

app = FastAPI(title="amarisound stems")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Stems", "X-Frames", "X-Seconds"],
)


@app.get("/api/health")
def health():
    return {"ok": True, "model": "htdemucs", "engine": "onnxruntime", "segment_seconds": separator.SEGMENT / separator.SAMPLE_RATE}


@app.post("/api/stems")
async def stems(request: Request, ctx_l: int = 0, ctx_r: int = 0):
    import time

    body = await request.body()
    if len(body) % 4:
        raise HTTPException(400, "body must be int16 interleaved stereo")
    x = np.frombuffer(body, dtype="<i2").astype(np.float32).reshape(-1, 2).T / 32768.0
    n = x.shape[1]
    if n == 0 or n > separator.SEGMENT:
        raise HTTPException(413, f"chunk must be 1..{separator.SEGMENT} frames, got {n}")
    if ctx_l < 0 or ctx_r < 0 or ctx_l + ctx_r >= n:
        raise HTTPException(400, "bad context")
    t = time.time()
    out = separator.separate(np.ascontiguousarray(x))
    core = slice(ctx_l, n - ctx_r)
    parts = []
    for name in separator.SOURCES:
        s = np.clip(out[name][:, core], -1.0, 1.0)
        parts.append((s.T * 32767.0).astype("<i2").tobytes())
    return Response(
        content=b"".join(parts),
        media_type="application/octet-stream",
        headers={
            "X-Stems": ",".join(separator.SOURCES),
            "X-Frames": str(n - ctx_l - ctx_r),
            "X-Seconds": f"{time.time() - t:.2f}",
        },
    )
