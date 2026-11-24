import os, sys, time, threading, subprocess
V = sys.argv[1] if len(sys.argv) > 1 else None
if V is None:
    for v in ["all", "basic", "none", "ort_direct"]:
        print(subprocess.run([sys.executable, __file__, v], capture_output=True, text=True).stdout.strip())
    sys.exit()
import numpy as np, psutil, onnxruntime as ort
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import separator, dsp
proc = psutil.Process(); peak=[0]; stop=[False]
def w():
    while not stop[0]: peak[0]=max(peak[0], proc.memory_info().rss); time.sleep(0.003)
threading.Thread(target=w, daemon=True).start()
fp32 = separator._fp32_model_path()
o = ort.SessionOptions(); o.intra_op_num_threads = 1; o.enable_cpu_mem_arena=False; o.enable_mem_pattern=False
path = fp32
if V == "basic": o.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
elif V == "none": o.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
elif V == "all": o.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
elif V == "ort_direct":
    ortp = fp32.replace(".onnx", ".ort")
    if not os.path.exists(ortp):
        subprocess.run([sys.executable, "-m", "onnxruntime.tools.convert_onnx_models_to_ort", fp32, "--optimization_style", "Fixed", "--output_dir", os.path.dirname(fp32)], capture_output=True)
        cand = [f for f in os.listdir(os.path.dirname(fp32)) if f.startswith("amari_htdemucs_fp32") and f.endswith(".ort")]
        os.replace(os.path.join(os.path.dirname(fp32), cand[0]), ortp)
    data = open(ortp, "rb").read()
    o.add_session_config_entry("session.use_ort_model_bytes_directly", "1")
    o.add_session_config_entry("session.use_ort_model_bytes_for_initializers", "1")
    path = data
t=time.time(); s = ort.InferenceSession(path, o, providers=["CPUExecutionProvider"]); load_rss = proc.memory_info().rss
mix = np.zeros((1,2,separator.SEGMENT), np.float32); mix[0] = np.load(os.path.join(os.path.dirname(separator.MODEL_PATH), "_test_mix.npy"))[0]
z = dsp.spec(mix); t2=time.time(); s.run(None, {"mix": mix, "mag": dsp.magnitude(z)}); dt=time.time()-t2
stop[0]=True
print(f"{V:11s} loaded rss {load_rss/1e6:5.0f} MB · run {dt:4.1f}s · PEAK {peak[0]/1e6:5.0f} MB")
