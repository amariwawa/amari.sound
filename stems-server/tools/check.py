"""Speed / memory / quality check of the ONNX separator against the PyTorch reference."""
import os, resource, sys, time
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import separator
M = os.path.join(os.path.dirname(separator.MODEL_PATH))
mix = np.load(os.path.join(M, "_test_mix.npy")); ref = np.load(os.path.join(M, "_test_ref.npy"))
t = time.time(); separator.load(); print(f"load {time.time()-t:.1f}s")
t = time.time(); out = separator.separate(mix[0]); dt = time.time() - t
est = np.stack([out[s] for s in separator.SOURCES])
err = est - ref[0]
sdr = 10 * np.log10((ref[0] ** 2).sum() / (err ** 2).sum())
print(f"separate 7.8 s segment: {dt:.1f}s  ·  fp16-weights vs pytorch SDR {sdr:.1f} dB  ·  peak RSS {resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1e6:.0f} MB")
