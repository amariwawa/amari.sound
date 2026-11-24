/** Audio utilities: resampling, waveform overview, silence trim, WAV encoding, click ticks. */
import { ANALYSIS_SR } from './tempo';

/** Mono mixdown at the analysis rate using the browser's native resampler. */
export async function toAnalysisMono(buf: AudioBuffer, maxSeconds = 120): Promise<Float32Array> {
  const dur = Math.min(buf.duration, maxSeconds);
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(dur * ANALYSIS_SR)), ANALYSIS_SR);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start(0, 0, dur);
  const out = await off.startRendering();
  return out.getChannelData(0);
}

/** Stereo 44.1 kHz render (what the stem separator expects). */
export async function toStereo44k(buf: AudioBuffer, maxSeconds = 600): Promise<AudioBuffer> {
  const dur = Math.min(buf.duration, maxSeconds);
  const off = new OfflineAudioContext(2, Math.max(1, Math.ceil(dur * 44100)), 44100);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start(0, 0, dur);
  return off.startRendering();
}

/** Interleaved [min, max] per bucket over all channels. `normalize` scales the loudest peak to 1. */
export function waveformPeaks(buf: AudioBuffer, buckets = 900, normalize = true): number[] {
  const len = buf.length;
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const out: number[] = [];
  let norm = 0;
  for (let b = 0; b < buckets; b++) {
    const s = Math.floor((b * len) / buckets), e = Math.max(s + 1, Math.floor(((b + 1) * len) / buckets));
    let mn = 0, mx = 0;
    for (const ch of chans) for (let i = s; i < e; i += 4) { const v = ch[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    out.push(mn, mx);
    norm = Math.max(norm, -mn, mx);
  }
  return normalize && norm > 0 ? out.map((v) => v / norm) : out;
}

/** RMS level in dBFS over all channels. */
export function rmsDb(buf: AudioBuffer): number {
  let s = 0, n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i += 2) { s += d[i] * d[i]; n++; }
  }
  return 10 * Math.log10(s / Math.max(1, n) + 1e-12);
}

/** Trim leading/trailing silence (below −50 dB of the peak), keeping a few ms of air. */
export function trimSilence(x: Float32Array, sr: number): Float32Array {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (peak === 0) return x;
  const thr = peak * 10 ** (-50 / 20);
  const win = Math.round(sr * 0.01);
  const loud = (i: number) => {
    for (let k = i; k < Math.min(x.length, i + win); k++) if (Math.abs(x[k]) > thr) return true;
    return false;
  };
  let s = 0;
  while (s < x.length && !loud(s)) s += win;
  let e = x.length;
  while (e > s && !loud(Math.max(s, e - win))) e -= win;
  const pad = Math.round(sr * 0.005);
  return x.slice(Math.max(0, s - pad), Math.min(x.length, e + pad));
}

/** 16-bit PCM WAV. */
export function encodeWav(buf: AudioBuffer): Uint8Array {
  const ch = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length;
  const data = ch * n * 2;
  const out = new DataView(new ArrayBuffer(44 + data));
  const str = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); out.setUint32(4, 36 + data, true); str(8, 'WAVE');
  str(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
  str(36, 'data'); out.setUint32(40, data, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  return new Uint8Array(out.buffer);
}

let tickBuf: AudioBuffer | null = null;
/** Short unpitched tick at ctx time `t`. */
export function tick(ctx: BaseAudioContext, dest: AudioNode, t: number, accent: boolean) {
  if (!tickBuf || tickBuf.sampleRate !== ctx.sampleRate) {
    tickBuf = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.03), ctx.sampleRate);
    const d = tickBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.006));
  }
  const src = ctx.createBufferSource();
  src.buffer = tickBuf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = accent ? 2500 : 4500;
  const g = ctx.createGain();
  g.gain.value = accent ? 0.9 : 0.55;
  src.connect(hp).connect(g).connect(dest);
  src.start(t);
}
