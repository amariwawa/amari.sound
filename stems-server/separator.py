"""
Demucs (htdemucs, Meta) source separation on ONNX Runtime — no PyTorch needed at runtime.

The network core runs in ONNX (model/htdemucs.onnx, fp16-stored weights restored to fp32 at load);
the spectrogram front/back end is NumPy (dsp.py). One call handles up to one model segment
(4 s at 44.1 kHz); the browser sends longer audio as overlapping chunks.
"""
import gc
import os
import subprocess
import sys
import tempfile
import threading

import numpy as np
import onnx
import onnxruntime as ort
from onnx import numpy_helper

import dsp

SAMPLE_RATE = 44100
SEGMENT = 4 * SAMPLE_RATE  # exported segment (tools/export_onnx.py) — 4 s keeps serverless memory low
SOURCES = ["drums", "bass", "other", "vocals"]
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model", "htdemucs.onnx")

_session = None
_lock = threading.Lock()


def _convert(src: str, dst: str) -> None:
    """fp16-stored weights -> fp32 ONNX file."""
    model = onnx.load(src)
    for init in model.graph.initializer:
        if init.data_type == onnx.TensorProto.FLOAT16:
            init.CopyFrom(numpy_helper.from_array(numpy_helper.to_array(init).astype(np.float32), init.name))
    tmp = f"{dst}.{os.getpid()}.part"
    onnx.save(model, tmp)
    os.replace(tmp, dst)


def _fp32_model_path() -> str:
    """Restore fp32 weights once into a temp file. Done in a child process so the conversion's
    memory is fully returned to the OS before the model runs (serverless memory limit)."""
    out = os.path.join(tempfile.gettempdir(), "amari_htdemucs_fp32.onnx")
    if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(MODEL_PATH):
        return out
    here = os.path.dirname(os.path.abspath(__file__))
    code = f"import sys; sys.path.insert(0, {here!r}); import separator; separator._convert({MODEL_PATH!r}, {out!r})"
    subprocess.run([sys.executable, "-c", code], check=True)
    return out


def load() -> ort.InferenceSession:
    global _session
    with _lock:
        if _session is None:
            path = _fp32_model_path()
            opts = ort.SessionOptions()
            # graph optimizations duplicate the weights (measured: 788 MB peak without vs 1.26 GB with)
            # and don't make this model faster — keep them off for serverless memory limits
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
            opts.intra_op_num_threads = int(os.environ.get("STEMS_THREADS", "0"))  # 0 = all cores
            # keep peak memory low for serverless (2 GB): no arena, no pre-planned memory patterns
            opts.enable_cpu_mem_arena = False
            opts.enable_mem_pattern = False
            _session = ort.InferenceSession(path, opts, providers=["CPUExecutionProvider"])
            gc.collect()
    return _session


def separate(mix: np.ndarray) -> dict:
    """mix: (2, n) float32, n <= SEGMENT -> {source: (2, n) float32}"""
    n = mix.shape[-1]
    if n > SEGMENT:
        raise ValueError(f"chunk too long: {n} samples (max {SEGMENT})")
    x = np.zeros((1, 2, SEGMENT), dtype=np.float32)
    x[0, :, :n] = mix
    z = dsp.spec(x)
    s_out, t_out = load().run(None, {"mix": x, "mag": dsp.magnitude(z)})
    out = dsp.ispec(dsp.mask(s_out), SEGMENT) + t_out  # (1, S, 2, SEGMENT)
    return {name: out[0, i, :, :n] for i, name in enumerate(SOURCES)}
