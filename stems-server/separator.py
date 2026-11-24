"""
Demucs (htdemucs, Meta) source separation on ONNX Runtime — no PyTorch needed at runtime.

The network core runs in ONNX (model/htdemucs.onnx, fp16-stored weights restored to fp32 at load);
the spectrogram front/back end is NumPy (dsp.py). One call handles up to one model segment
(7.8 s at 44.1 kHz); the browser sends longer audio as overlapping chunks.
"""
import os
import threading

import numpy as np
import onnx
import onnxruntime as ort
from onnx import numpy_helper

import dsp

SAMPLE_RATE = 44100
SEGMENT = int(39 / 5 * SAMPLE_RATE)  # 343980 samples — htdemucs training segment
SOURCES = ["drums", "bass", "other", "vocals"]
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model", "htdemucs.onnx")

_session = None
_lock = threading.Lock()


def load() -> ort.InferenceSession:
    global _session
    with _lock:
        if _session is None:
            model = onnx.load(MODEL_PATH)
            for init in model.graph.initializer:
                if init.data_type == onnx.TensorProto.FLOAT16:
                    init.CopyFrom(numpy_helper.from_array(numpy_helper.to_array(init).astype(np.float32), init.name))
            opts = ort.SessionOptions()
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            opts.intra_op_num_threads = int(os.environ.get("STEMS_THREADS", "0"))  # 0 = all cores
            # keep peak memory low for serverless (2 GB): no arena, no pre-planned memory patterns
            opts.enable_cpu_mem_arena = False
            opts.enable_mem_pattern = False
            blob = model.SerializeToString()
            del model
            _session = ort.InferenceSession(blob, opts, providers=["CPUExecutionProvider"])
            del blob
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
