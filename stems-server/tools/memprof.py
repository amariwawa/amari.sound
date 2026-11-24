import os, sys, time, threading
import numpy as np, psutil
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
proc = psutil.Process(); peak = [0]; stop = [False]
def watch():
    while not stop[0]:
        peak[0] = max(peak[0], proc.memory_info().rss); time.sleep(0.005)
threading.Thread(target=watch, daemon=True).start()
def mark(label): time.sleep(0.05); print(f"{label:28s} rss {proc.memory_info().rss/1e6:6.0f} MB · peak so far {peak[0]/1e6:6.0f} MB")
mark("start")
import separator; mark("imports")
separator.load(); mark("model loaded")
mix = np.load(os.path.join(os.path.dirname(separator.MODEL_PATH), "_test_mix.npy"))[0]
t=time.time(); separator.separate(mix); mark(f"separated ({time.time()-t:.1f}s)")
stop[0]=True
