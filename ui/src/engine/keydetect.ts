/**
 * Key detection from audio.
 *
 *  1. Chroma from spectral peaks (STFT 8192 / hop 2048 @ 22.05 kHz, 50 Hz–2 kHz):
 *     each peak's frequency is refined by parabolic interpolation, the global tuning offset
 *     is estimated and removed (detuned samples still work), then folded to a pitch class.
 *  2. Optional AI evidence: a pitch-class histogram of notes transcribed by Basic Pitch.
 *  3. All 24 keys ranked by Pearson correlation with the Krumhansl–Kessler profiles.
 *  4. Relative major/minor share all 7 notes, so profiles alone can't separate them. When the top
 *     two are a relative pair, the tonic is decided by the bass line — overall and at the start of
 *     the sample (loops almost always begin on the home chord).
 */
import type { KeyAnalysis, KeyChoice, KeyScore, Mode } from '../types';
import { FFT } from './dsp';
import { ANALYSIS_SR } from './tempo';

const N = 8192;
const HOP = 2048;
const FMIN = 50;
const FMAX = 2000;
const PEAKS_PER_FRAME = 24;

const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];



export function spectralChroma(x: Float32Array): { chroma: number[]; bass: number[]; bassEarly: number[]; tuningCents: number; tonality: number } {
  const frames = x.length >= N ? Math.floor((x.length - N) / HOP) + 1 : x.length > 2048 ? 1 : 0;
  const fft = new FFT(N);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const re = new Float64Array(N), im = new Float64Array(N), mag = new Float64Array(N / 2);
  const kMin = Math.ceil((FMIN * N) / ANALYSIS_SR), kMax = Math.floor((FMAX * N) / ANALYSIS_SR);
  const peaks: { midi: number; w: number; t: number }[] = [];
  let peakEnergy = 0, totalEnergy = 0;

  for (let t = 0; t < frames; t++) {
    const off = t * HOP;
    for (let i = 0; i < N; i++) { re[i] = (x[off + i] ?? 0) * win[i]; im[i] = 0; }
    fft.transform(re, im);
    for (let k = 0; k < N / 2; k++) mag[k] = Math.hypot(re[k], im[k]);

    const local: { midi: number; w: number }[] = [];
    for (let k = kMin; k <= kMax; k++) {
      totalEnergy += mag[k];
      if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1] && mag[k] > mag[k - 2] && mag[k] >= mag[k + 2]) {
        const a = Math.log(mag[k - 1] + 1e-12), b = Math.log(mag[k] + 1e-12), c = Math.log(mag[k + 1] + 1e-12);
        const shift = (0.5 * (a - c)) / (a - 2 * b + c || 1e-12);
        const f = ((k + Math.max(-0.5, Math.min(0.5, shift))) * ANALYSIS_SR) / N;
        local.push({ midi: 69 + 12 * Math.log2(f / 440), w: mag[k] });
      }
    }
    local.sort((p, q) => q.w - p.w);
    for (const p of local.slice(0, PEAKS_PER_FRAME)) {
      peaks.push({ midi: p.midi, w: Math.sqrt(p.w), t });
      peakEnergy += p.w;
    }
  }

  // global tuning: circular mean of deviation from equal temperament
  let sx = 0, sy = 0;
  for (const p of peaks) {
    const ang = 2 * Math.PI * (p.midi - Math.round(p.midi));
    sx += p.w * Math.cos(ang);
    sy += p.w * Math.sin(ang);
  }
  const tuning = Math.atan2(sy, sx) / (2 * Math.PI); // semitones, −0.5..0.5

  const chroma = new Array(12).fill(0);
  const bass = new Array(12).fill(0);
  const bassEarly = new Array(12).fill(0);
  const earlyFrames = Math.max(2, Math.ceil(frames * 0.15));
  for (const p of peaks) {
    const m = p.midi - tuning;
    const dev = Math.abs(m - Math.round(m));
    const closeness = Math.max(0, 1 - dev / 0.35);
    const pc = ((Math.round(m) % 12) + 12) % 12;
    chroma[pc] += p.w * closeness;
    if (m < 59) {
      bass[pc] += p.w * closeness;
      if (p.t < earlyFrames) bassEarly[pc] += p.w * closeness;
    }
  }
  const unit = (a: number[]) => {
    const s = a.reduce((x, y) => x + y, 0);
    return s > 0 ? a.map((v) => v / s) : a;
  };
  const sum = chroma.reduce((a, b) => a + b, 0) || 1;
  // tonality: peak share of energy × how far the chroma is from flat
  const norm = chroma.map((c) => c / sum);
  const flatness = Math.sqrt(norm.reduce((s, c) => s + (c - 1 / 12) ** 2, 0) / 12) / 0.08;
  const tonality = Math.max(0, Math.min(1, flatness * Math.min(1, (peakEnergy / (totalEnergy + 1e-12)) * 4)));
  return { chroma: norm, bass: unit(bass), bassEarly: unit(bassEarly), tuningCents: Math.round(tuning * 100), tonality };
}

function pearson(a: number[], b: number[]) {
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export function rankKeys(profile: number[]): KeyScore[] {
  const out: KeyScore[] = [];
  for (const mode of ['major', 'minor'] as Mode[]) {
    const prof = mode === 'major' ? KK_MAJOR : KK_MINOR;
    for (let tonic = 0; tonic < 12; tonic++) {
      out.push({ tonic, mode, score: pearson(profile, profile.map((_, pc) => prof[(pc - tonic + 12) % 12])) });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Pitch-class histogram from transcribed notes (seconds × loudness), normalised. */
export function noteProfile(notes: { pitch: number; dur: number; velocity: number }[]) {
  const h = new Array(12).fill(0);
  for (const n of notes) h[n.pitch % 12] += n.dur * (n.velocity / 127);
  const sum = h.reduce((a, b) => a + b, 0);
  return sum > 0 ? h.map((v) => v / sum) : null;
}

const relativeTonic = (k: KeyChoice) => (k.mode === 'major' ? (k.tonic + 9) % 12 : (k.tonic + 3) % 12);
const isRelativePair = (a: KeyChoice, b: KeyChoice) => a.mode !== b.mode && relativeTonic(a) === b.tonic;

export function analyzeKey(
  x: Float32Array,
  aiNotes?: { pitch: number; start?: number; dur: number; velocity: number }[],
): KeyAnalysis {
  const { chroma, bass, bassEarly, tuningCents, tonality } = spectralChroma(x);
  const ai = aiNotes?.length ? noteProfile(aiNotes) : null;
  const profile = ai ? chroma.map((c, i) => 0.5 * c + 0.5 * ai[i]) : chroma;
  const ranking = rankKeys(profile);

  // Relative major/minor tie-break by tonic evidence.
  let relativeAmbiguous = false;
  const [a, b] = ranking;
  if (a && b && isRelativePair(a, b) && a.score - b.score < 0.2) {
    relativeAmbiguous = true;
    // AI notes: lowest notes at the very start are strong tonic evidence too
    const aiEarly = new Array(12).fill(0);
    if (aiNotes?.length) {
      const first = Math.min(...aiNotes.map((n) => n.start ?? 0));
      const early = aiNotes.filter((n) => (n.start ?? 0) < first + 0.6);
      const low = Math.min(...early.map((n) => n.pitch));
      for (const n of early) if (n.pitch < low + 12) aiEarly[n.pitch % 12] += 1;
    }
    const evidence = (t: number) => 0.45 * bass[t] + 0.35 * bassEarly[t] + 0.1 * chroma[t] + 0.1 * (aiEarly[t] > 0 ? 1 : 0);
    if (evidence(b.tonic) > evidence(a.tonic)) {
      ranking[0] = b;
      ranking[1] = a;
    }
  }
  return { ranking, chroma: profile, tuningCents, tonality, relativeAmbiguous, source: ai ? 'spectrum+ai' : 'spectrum' };
}
