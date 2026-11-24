import os, sys, time, json, collections
import numpy as np, onnxruntime as ort
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import separator, dsp
mix = np.load(os.path.join(os.path.dirname(separator.MODEL_PATH), "_test_mix.npy"))
x = mix.astype(np.float32)
t=time.time(); z=dsp.spec(x); mag=dsp.magnitude(z); print(f"numpy spec {time.time()-t:.2f}s")
import onnx
from onnx import numpy_helper
model = onnx.load(separator.MODEL_PATH)
for init in model.graph.initializer:
    if init.data_type == onnx.TensorProto.FLOAT16:
        init.CopyFrom(numpy_helper.from_array(numpy_helper.to_array(init).astype(np.float32), init.name))
o = ort.SessionOptions(); o.intra_op_num_threads = int(sys.argv[1]); o.enable_profiling = True
o.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
s = ort.InferenceSession(model.SerializeToString(), o, providers=["CPUExecutionProvider"])
t=time.time(); so, to = s.run(None, {"mix": x, "mag": mag}); print(f"onnx run {time.time()-t:.1f}s (threads={sys.argv[1]})")
t=time.time(); y = dsp.ispec(dsp.mask(so), x.shape[-1]); print(f"numpy ispec {time.time()-t:.2f}s")
prof = s.end_profiling(); ev = json.load(open(prof)); os.remove(prof)
agg = collections.Counter()
for e in ev:
    if e.get("cat") == "Node": agg[e["args"].get("op_name","?")] += e["dur"]
for op, d in agg.most_common(8): print(f"  {op:22s} {d/1e6:7.2f}s")
