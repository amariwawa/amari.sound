"""
One-off: export Meta's htdemucs network core to ONNX (needs torch + demucs; NOT needed at runtime).

  .venv/bin/python tools/export_onnx.py

Writes model/htdemucs.onnx (graph) + verifies NumPy front/back end + ONNX == PyTorch.
Weights are stored as float16 to stay under GitHub's 100 MB file limit; separator.py restores fp32.
"""
import os
import sys

import numpy as np
import onnx
import torch
from demucs.pretrained import get_model
from einops import rearrange
from onnx import numpy_helper

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import dsp  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "model")
m = get_model("htdemucs").models[0].eval()
L = int(m.segment * m.samplerate)
S = len(m.sources)


class Core(torch.nn.Module):
    """HTDemucs.forward minus STFT/ISTFT/mask (copied from demucs 4.0.1, eval path)."""

    def __init__(self, model):
        super().__init__()
        self.m = model

    def forward(self, mix, mag):
        self_ = self.m
        x = mag
        B, C, Fq, T = x.shape
        mean = x.mean(dim=(1, 2, 3), keepdim=True)
        std = x.std(dim=(1, 2, 3), keepdim=True)
        x = (x - mean) / (1e-5 + std)
        xt = mix
        meant = xt.mean(dim=(1, 2), keepdim=True)
        stdt = xt.std(dim=(1, 2), keepdim=True)
        xt = (xt - meant) / (1e-5 + stdt)
        saved, saved_t, lengths, lengths_t = [], [], [], []
        for idx, encode in enumerate(self_.encoder):
            lengths.append(x.shape[-1])
            inject = None
            if idx < len(self_.tencoder):
                lengths_t.append(xt.shape[-1])
                tenc = self_.tencoder[idx]
                xt = tenc(xt)
                if not tenc.empty:
                    saved_t.append(xt)
                else:
                    inject = xt
            x = encode(x, inject)
            if idx == 0 and self_.freq_emb is not None:
                frs = torch.arange(x.shape[-2], device=x.device)
                emb = self_.freq_emb(frs).t()[None, :, :, None].expand_as(x)
                x = x + self_.freq_emb_scale * emb
            saved.append(x)
        if self_.crosstransformer:
            if self_.bottom_channels:
                b, c, f, t = x.shape
                x = rearrange(x, "b c f t-> b c (f t)")
                x = self_.channel_upsampler(x)
                x = rearrange(x, "b c (f t)-> b c f t", f=f)
                xt = self_.channel_upsampler_t(xt)
            x, xt = self_.crosstransformer(x, xt)
            if self_.bottom_channels:
                x = rearrange(x, "b c f t-> b c (f t)")
                x = self_.channel_downsampler(x)
                x = rearrange(x, "b c (f t)-> b c f t", f=f)
                xt = self_.channel_downsampler_t(xt)
        for idx, decode in enumerate(self_.decoder):
            skip = saved.pop(-1)
            x, pre = decode(x, skip, lengths.pop(-1))
            offset = self_.depth - len(self_.tdecoder)
            if idx >= offset:
                tdec = self_.tdecoder[idx - offset]
                length_t = lengths_t.pop(-1)
                if tdec.empty:
                    pre = pre[:, :, 0]
                    xt, _ = tdec(pre, None, length_t)
                else:
                    skip = saved_t.pop(-1)
                    xt, _ = tdec(xt, skip, length_t)
        x = x.view(B, S, -1, Fq, T)
        x = x * std[:, None] + mean[:, None]
        xt = xt.view(B, S, -1, L)
        xt = xt * stdt[:, None] + meant[:, None]
        return x, xt


def main():
    os.makedirs(OUT, exist_ok=True)
    rng = np.random.default_rng(0)
    # a test mix: tones + noise bursts
    t = np.arange(L) / m.samplerate
    mix = (0.3 * np.sin(2 * np.pi * 110 * t) + 0.2 * np.sin(2 * np.pi * 440 * t) * (t % 0.5 < 0.25)
           + 0.1 * rng.standard_normal(L) * (t % 0.25 < 0.03)).astype(np.float32)
    mix = np.stack([mix, np.roll(mix, 37)])[None]

    # 1) numpy spec == torch spec
    with torch.no_grad():
        zt = m._spec(torch.from_numpy(mix)).numpy()
    zn = dsp.spec(mix)
    print("spec max err", float(np.abs(zt - zn).max()), "scale", float(np.abs(zt).max()))

    core = Core(m).eval()
    mag = dsp.magnitude(zn)
    with torch.no_grad():
        ref = m(torch.from_numpy(mix)).numpy()  # full PyTorch model
        xs, xt = core(torch.from_numpy(mix), torch.from_numpy(mag))
    ours = dsp.ispec(dsp.mask(xs.numpy()), L) + xt.numpy()
    print("torch-core + numpy ispec vs full model: max err", float(np.abs(ours - ref).max()), "scale", float(np.abs(ref).max()))

    path = os.path.join(OUT, "htdemucs_fp32.onnx")
    torch.onnx.export(core, (torch.from_numpy(mix), torch.from_numpy(mag)), path,
                      input_names=["mix", "mag"], output_names=["spec_out", "time_out"],
                      opset_version=17, do_constant_folding=True)
    print("exported", path, os.path.getsize(path) // 1_000_000, "MB")

    import onnxruntime as ort
    sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    s_out, t_out = sess.run(None, {"mix": mix, "mag": mag})
    onnx_full = dsp.ispec(dsp.mask(s_out), L) + t_out
    print("ONNX vs full PyTorch model: max err", float(np.abs(onnx_full - ref).max()))

    # store weights as float16 (separator.py converts back to fp32 at load)
    model = onnx.load(path)
    for init in model.graph.initializer:
        arr = numpy_helper.to_array(init)
        if arr.dtype == np.float32 and arr.size > 1024:
            init.CopyFrom(numpy_helper.from_array(arr.astype(np.float16), init.name))
    out16 = os.path.join(OUT, "htdemucs.onnx")
    onnx.save(model, out16)
    os.remove(path)
    print("saved", out16, os.path.getsize(out16) // 1_000_000, "MB  (fp16 weights)")
    np.save(os.path.join(OUT, "_test_mix.npy"), mix)
    np.save(os.path.join(OUT, "_test_ref.npy"), ref)


if __name__ == "__main__":
    main()
