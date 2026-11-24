/**
 * Sample FX: reverse and halftime.
 *
 * Halftime works like Cableguys HalfTime / ShaperBox / Gross Beat half-speed:
 *   - the audio is cut into tempo-synced loops (default 1 bar), aligned to the detected downbeat
 *   - in every loop, the FIRST HALF of that loop is played at half speed so it fills the whole loop
 *     (the second half of each loop is dropped)
 *   - playing at half speed drops the pitch one octave (same key), and the sample keeps its length
 *     and its BPM — it stays locked to the project tempo, it just *feels* half as fast
 *   - every loop restart is crossfaded (a few ms) so the jump back doesn't click
 * Short loops (1/4 bar) act more like a pitch-drop; long loops (1–2 bars) rearrange the groove.
 */
import type { Fx } from '../types';

export const NO_FX: Fx = { reverse: false, halftime: false, loopBeats: 4 };
export const fxActive = (fx: Fx) => fx.reverse || fx.halftime;
export const fxKey = (fx: Fx, bpm = 0) => `${fx.reverse ? 'r' : ''}${fx.halftime ? `h${fx.loopBeats}@${bpm}` : ''}`;

/** Grid of the untouched sample: tempo and first downbeat (seconds). */
export interface FxGrid {
  bpm: number;
  offset: number;
}

const SPEED = 2; // 2x = classic halftime
const XFADE_SEC = 0.006; // loop-restart crossfade

function reverse(ch: Float32Array) {
  const out = new Float32Array(ch.length);
  for (let i = 0, n = ch.length; i < n; i++) out[i] = ch[n - 1 - i];
  return out;
}

/** 4-point Catmull-Rom read at fractional position (0 outside the buffer). */
function readAt(x: Float32Array, p: number) {
  const i = Math.floor(p), t = p - i;
  const s = (k: number) => (k >= 0 && k < x.length ? x[k] : 0);
  const y0 = s(i - 1), y1 = s(i), y2 = s(i + 1), y3 = s(i + 2);
  return y1 + 0.5 * t * (y2 - y0 + t * (2 * y0 - 5 * y1 + 4 * y2 - y3 + t * (3 * (y1 - y2) + y3 - y0)));
}

/**
 * @param loopLen loop length in samples
 * @param phase   sample position of a loop start (a downbeat)
 */
function halftime(x: Float32Array, loopLen: number, phase: number, xfade: number) {
  const n = x.length;
  const out = new Float32Array(n);
  // first loop boundary at or after 0
  const p0 = ((phase % loopLen) + loopLen) % loopLen;
  for (let i = 0; i < n; i++) {
    if (i < p0) {
      out[i] = x[i]; // pickup before the first downbeat passes through
      continue;
    }
    const k = Math.floor((i - p0) / loopLen);
    const c0 = p0 + k * loopLen;
    const d = i - c0;
    let v = readAt(x, c0 + d / SPEED);
    if (d < xfade && k > 0) {
      // crossfade from the previous loop's continuing read into the restart (equal power)
      const cPrev = c0 - loopLen;
      const old = readAt(x, cPrev + (i - cPrev) / SPEED);
      const a = d / xfade;
      v = v * Math.sin((a * Math.PI) / 2) + old * Math.cos((a * Math.PI) / 2);
    }
    out[i] = v;
  }
  return out;
}

export function applyFx(ctx: BaseAudioContext, buf: AudioBuffer, fx: Fx, grid: FxGrid | null): AudioBuffer {
  if (!fxActive(fx)) return buf;
  const sr = buf.sampleRate;
  let chans: Float32Array[] = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  if (fx.reverse) chans = chans.map(reverse);
  if (fx.halftime && grid) {
    const spb = 60 / grid.bpm;
    const loopSec = fx.loopBeats * spb;
    // downbeats move when reversed: a downbeat at t lands at (duration - t)
    const downbeat = fx.reverse ? buf.duration - grid.offset : grid.offset;
    const phase = (((downbeat % loopSec) + loopSec) % loopSec) * sr;
    chans = chans.map((c) => halftime(c, loopSec * sr, phase, Math.round(XFADE_SEC * sr)));
  }
  const out = ctx.createBuffer(chans.length, chans[0].length, sr);
  chans.forEach((c, i) => out.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  return out;
}
