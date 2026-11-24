/**
 * Tempo (BPM) detection.
 *
 *  1. Onset-strength envelope: half-wave-rectified log-spectral flux (STFT 1024 / hop 256 @ 22.05 kHz).
 *  2. Autocorrelation of the envelope; each lag is scored with its harmonics (comb) and a
 *     log-normal prior around 115 BPM to choose the musically likely octave.
 *  3. Lag refined to sub-frame precision; if the sample is an exact loop (1–32 bars of 4/4)
 *     and the loop-length tempo agrees within 4 %, that exact value wins.
 *  4. Beat phase: offset that best lines a pulse train up with the onsets.
 */
import { FFT } from './dsp';
import type { TempoResult } from '../types';

export const ANALYSIS_SR = 22050;
const N = 1024;
const HOP = 256;
const FPS = ANALYSIS_SR / HOP;
const MIN_BPM = 55;
const MAX_BPM = 215;


function hann(n: number) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

export function onsetEnvelope(x: Float32Array): Float64Array {
  const frames = x.length >= N ? Math.floor((x.length - N) / HOP) + 1 : 0;
  const fft = new FFT(N);
  const win = hann(N);
  const re = new Float64Array(N), im = new Float64Array(N);
  const prev = new Float64Array(N / 2);
  const env = new Float64Array(frames);
  for (let t = 0; t < frames; t++) {
    const off = t * HOP;
    for (let i = 0; i < N; i++) { re[i] = x[off + i] * win[i]; im[i] = 0; }
    fft.transform(re, im);
    let flux = 0;
    for (let k = 1; k < N / 2; k++) {
      const l = Math.log1p(100 * Math.hypot(re[k], im[k]));
      if (t > 0) flux += Math.max(0, l - prev[k]);
      prev[k] = l;
    }
    env[t] = flux;
  }
  // remove slow trend, keep positive part, normalise
  const W = 16;
  const out = new Float64Array(frames);
  let max = 1e-12;
  for (let t = 0; t < frames; t++) {
    let s = 0, c = 0;
    for (let k = Math.max(0, t - W); k <= Math.min(frames - 1, t + W); k++) { s += env[k]; c++; }
    out[t] = Math.max(0, env[t] - s / c);
    if (out[t] > max) max = out[t];
  }
  for (let t = 0; t < frames; t++) out[t] /= max;
  return out;
}

function autocorr(env: Float64Array, maxLag: number) {
  const n = env.length;
  const ac = new Float64Array(maxLag + 1);
  for (let l = 0; l <= maxLag; l++) {
    let s = 0;
    for (let t = 0; t + l < n; t++) s += env[t] * env[t + l];
    ac[l] = s / Math.max(1, n - l);
  }
  return ac;
}

const lerp = (a: Float64Array, x: number) => {
  const i = Math.floor(x);
  if (i < 0 || i + 1 >= a.length) return 0;
  return a[i] + (a[i + 1] - a[i]) * (x - i);
};

/** Comb score: the lag plus its multiples (decaying weight). */
function comb(ac: Float64Array, lag: number) {
  let s = 0, w = 0;
  for (let k = 1; k <= 4; k++) {
    if (lag * k >= ac.length - 1) break;
    s += lerp(ac, lag * k) / k;
    w += 1 / k;
  }
  return w ? s / w : 0;
}

const prior = (bpm: number) => Math.exp(-0.5 * (Math.log2(bpm / 115) / 0.8) ** 2);

export function detectTempo(x: Float32Array): TempoResult {
  const env = onsetEnvelope(x);
  const duration = x.length / ANALYSIS_SR;
  const minLag = (60 * FPS) / MAX_BPM;
  const maxLag = (60 * FPS) / MIN_BPM;
  const ac = autocorr(env, Math.min(env.length - 1, Math.ceil(maxLag * 4) + 2));

  // coarse search over lags (0.25-frame steps), prior-weighted
  let bestLag = 0, bestScore = -1;
  for (let lag = minLag; lag <= maxLag; lag += 0.25) {
    const s = comb(ac, lag) * prior((60 * FPS) / lag);
    if (s > bestScore) { bestScore = s; bestLag = lag; }
  }
  // fine search without prior around the winner
  let fineLag = bestLag, fineScore = -1;
  for (let lag = bestLag - 0.5; lag <= bestLag + 0.5; lag += 0.02) {
    const s = comb(ac, lag);
    if (s > fineScore) { fineScore = s; fineLag = lag; }
  }
  let bpm = (60 * FPS) / fineLag;

  // confidence: periodic peak vs. average correlation
  let mean = 0;
  for (let l = Math.floor(minLag); l <= Math.min(ac.length - 1, Math.ceil(maxLag)); l++) mean += ac[l];
  mean /= Math.max(1, Math.ceil(maxLag) - Math.floor(minLag) + 1);
  const confidence = ac[0] > 0 ? Math.max(0, Math.min(1, (fineScore - mean) / (ac[0] - mean + 1e-12) * 1.8)) : 0;

  // exact-loop snap
  let fromLoopLength = false, loopBars: number | null = null;
  for (const bars of [1, 2, 4, 8, 16, 32]) {
    const loopBpm = (240 * bars) / duration;
    if (loopBpm < MIN_BPM || loopBpm > MAX_BPM) continue;
    for (const mult of [1, 0.5, 2]) {
      const cand = bpm * mult;
      if (Math.abs(loopBpm - cand) / cand < 0.04) {
        if (mult === 1 || prior(loopBpm) > prior(bpm) * 0.8) {
          bpm = loopBpm;
          fromLoopLength = true;
          loopBars = bars;
        }
      }
    }
    if (fromLoopLength) break;
  }
  bpm = Math.abs(bpm - Math.round(bpm)) < 0.25 ? Math.round(bpm) : Math.round(bpm * 10) / 10;

  // beat phase
  const period = (60 * FPS) / bpm;
  let bestOff = 0, bestSum = -1;
  for (let o = 0; o < period; o += 0.5) {
    let s = 0;
    for (let p = o; p < env.length; p += period) s += lerp(env, p) + 0.5 * lerp(env, p + 1) + 0.5 * lerp(env, p - 1);
    if (s > bestSum) { bestSum = s; bestOff = o; }
  }
  const beatOffset = (bestOff * HOP + N / 2) / ANALYSIS_SR;

  const alternatives = [bpm / 2, bpm * 2]
    .filter((b) => b >= 45 && b <= 260)
    .map((b) => (Math.abs(b - Math.round(b)) < 0.25 ? Math.round(b) : Math.round(b * 10) / 10));

  return { bpm, confidence, alternatives, beatOffset, fromLoopLength, loopBars };
}
