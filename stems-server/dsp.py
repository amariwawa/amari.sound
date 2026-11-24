"""
NumPy re-implementation of HTDemucs' spectrogram front/back end (demucs/htdemucs.py _spec,
_magnitude, _mask, _ispec and demucs/spec.py spectro/ispectro), so the neural network core can run
in ONNX Runtime without PyTorch. Matches torch.stft/istft(normalized=True, center=True, reflect).
"""
import math

import numpy as np

NFFT = 4096
HOP = 1024


def _hann(n: int) -> np.ndarray:
    # torch.hann_window(n) is periodic
    return (0.5 - 0.5 * np.cos(2 * np.pi * np.arange(n) / n)).astype(np.float32)


_WIN = _hann(NFFT)


def stft(x: np.ndarray) -> np.ndarray:
    """x: (..., L) float32 -> (..., NFFT//2+1, frames) complex64"""
    pad = NFFT // 2
    xp = np.pad(x, [(0, 0)] * (x.ndim - 1) + [(pad, pad)], mode="reflect")
    frames = 1 + (xp.shape[-1] - NFFT) // HOP
    idx = np.arange(NFFT)[None, :] + HOP * np.arange(frames)[:, None]
    fr = xp[..., idx] * _WIN  # (..., frames, NFFT)
    z = np.fft.rfft(fr, axis=-1) / math.sqrt(NFFT)
    return np.swapaxes(z, -1, -2).astype(np.complex64)


def istft(z: np.ndarray, length: int) -> np.ndarray:
    """z: (..., NFFT//2+1, frames) -> (..., length)"""
    frames = z.shape[-1]
    fr = np.fft.irfft(np.swapaxes(z, -1, -2), n=NFFT, axis=-1) * math.sqrt(NFFT)
    fr = fr * _WIN
    total = NFFT + HOP * (frames - 1)
    out = np.zeros(z.shape[:-2] + (total,), dtype=np.float64)
    env = np.zeros(total, dtype=np.float64)
    w2 = _WIN.astype(np.float64) ** 2
    for i in range(frames):
        s = i * HOP
        out[..., s: s + NFFT] += fr[..., i, :]
        env[s: s + NFFT] += w2
    out = out / np.where(env > 1e-11, env, 1.0)
    start = NFFT // 2
    y = out[..., start: start + length]
    if y.shape[-1] < length:
        y = np.pad(y, [(0, 0)] * (y.ndim - 1) + [(0, length - y.shape[-1])])
    return y.astype(np.float32)


def spec(x: np.ndarray) -> np.ndarray:
    """HTDemucs._spec: (B, C, L) -> (B, C, 2048, le) complex"""
    le = int(math.ceil(x.shape[-1] / HOP))
    pad = HOP // 2 * 3
    xp = np.pad(x, [(0, 0), (0, 0), (pad, pad + le * HOP - x.shape[-1])], mode="reflect")
    z = stft(xp)[..., :-1, :]
    return z[..., 2: 2 + le]


def magnitude(z: np.ndarray) -> np.ndarray:
    """complex-as-channels: (B, C, F, T) complex -> (B, 2C, F, T) real  [c0.re, c0.im, c1.re, c1.im]"""
    B, C, Fr, T = z.shape
    m = np.stack([z.real, z.imag], axis=2)  # (B, C, 2, F, T)
    return m.reshape(B, C * 2, Fr, T).astype(np.float32)


def mask(m: np.ndarray) -> np.ndarray:
    """(B, S, 2C, F, T) real -> (B, S, C, F, T) complex"""
    B, S, C2, Fr, T = m.shape
    m = m.reshape(B, S, C2 // 2, 2, Fr, T)
    return (m[:, :, :, 0] + 1j * m[:, :, :, 1]).astype(np.complex64)


def ispec(z: np.ndarray, length: int) -> np.ndarray:
    """HTDemucs._ispec: (..., 2048, le) complex -> (..., length)"""
    z = np.pad(z, [(0, 0)] * (z.ndim - 2) + [(0, 1), (2, 2)])
    pad = HOP // 2 * 3
    le = HOP * int(math.ceil(length / HOP)) + 2 * pad
    x = istft(z, le)
    return x[..., pad: pad + length]
