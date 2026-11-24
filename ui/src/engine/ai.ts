/**
 * AI transcription with Spotify's Basic Pitch (Apache-2.0): a small neural network trained on
 * voice and instrument recordings. Polyphonic — picks up melodies, whistles, hums and chords. Used here as extra evidence for key detection.
 * Runs locally via TensorFlow.js (WebGL when available). Model files: public/models/basic-pitch/.
 */
import * as tf from '@tensorflow/tfjs';
import { BasicPitch, addPitchBendsToNoteEvents, noteFramesToTime, outputToNotesPoly } from '@spotify/basic-pitch';
import { Resampler } from './dsp';

const MODEL_SR = 22050;
export interface AiNote {
  pitch: number;
  /** seconds */
  start: number;
  dur: number;
  velocity: number;
}

const MODEL_URL = `${import.meta.env.BASE_URL}models/basic-pitch/model.json`;

/** Detection thresholds (Basic Pitch defaults are 0.5 / 0.3 / 11 frames ≈ 128 ms). */
const ONSET_THRESHOLD = 0.5;
const FRAME_THRESHOLD = 0.3;
const MIN_NOTE_FRAMES = 11;

let model: BasicPitch | null = null;
let warm: Promise<void> | null = null;

/** Start downloading/compiling the model early so the first take is fast. */
export function preloadAi(): Promise<void> {
  warm ??= (async () => {
    await tf.ready();
    model = new BasicPitch(tf.loadGraphModel(MODEL_URL));
    // tiny warm-up pass compiles the WebGL kernels
    await model.evaluateModel(new Float32Array(MODEL_SR), () => {}, () => {});
  })();
  return warm;
}

export const aiBackend = () => tf.getBackend();

export async function transcribe(chunks: Float32Array[], sr: number, onProgress?: (pct: number) => void): Promise<AiNote[]> {
  await preloadAi();

  // resample to the model rate
  const rs = new Resampler(sr, MODEL_SR);
  for (const c of chunks) rs.push(c);
  rs.push(new Float32Array(2048)); // flush the filter tail
  const audio = rs.output().slice();

  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];
  await model!.evaluateModel(
    audio,
    (f, o, c) => {
      frames.push(...f);
      onsets.push(...o);
      contours.push(...c);
    },
    (p) => onProgress?.(p),
  );

  const events = noteFramesToTime(
    addPitchBendsToNoteEvents(contours, outputToNotesPoly(frames, onsets, ONSET_THRESHOLD, FRAME_THRESHOLD, MIN_NOTE_FRAMES)),
  );
  return events
    .filter((n) => n.pitchMidi >= 21 && n.pitchMidi <= 108)
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds || a.pitchMidi - b.pitchMidi)
    .map((n) => ({
      pitch: n.pitchMidi,
      start: n.startTimeSeconds,
      dur: n.durationSeconds,
      velocity: Math.max(30, Math.min(127, Math.round(30 + 97 * Math.min(1, n.amplitude)))),
    }));
}
