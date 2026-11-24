export type Mode = 'major' | 'minor';

export interface KeyChoice {
  /** Pitch class 0..11 (C = 0) */
  tonic: number;
  mode: Mode;
}

export interface KeyScore extends KeyChoice {
  /** Pearson correlation with the key profile, −1..1 */
  score: number;
}

export interface TempoResult {
  bpm: number;
  /** 0..1 — how strongly periodic the sample is */
  confidence: number;
  /** half / double time alternatives within a sensible range */
  alternatives: number[];
  /** seconds of the first detected beat */
  beatOffset: number;
  /** true when snapped to an exact loop length */
  fromLoopLength: boolean;
  loopBars: number | null;
}

export interface KeyAnalysis {
  /** all 24 keys, best first */
  ranking: KeyScore[];
  /** normalised pitch-class profile used (sums to 1) */
  chroma: number[];
  tuningCents: number;
  /** 0 = noise/drums, 1 = clearly pitched */
  tonality: number;
  /** the runner-up is the relative key (same notes) and was separated by the bass/tonic check */
  relativeAmbiguous: boolean;
  source: 'spectrum' | 'spectrum+ai';
}

export interface Analysis {
  sampleId: number;
  tempo: TempoResult;
  key: KeyAnalysis;
  /** AI refinement still running */
  aiPending: boolean;
  aiNotes: number;
}

export interface Fx {
  reverse: boolean;
  /** bar-synced halftime (HalfTime / Gross Beat style): same length & BPM, half-speed feel, octave down */
  halftime: boolean;
  /** halftime loop length in beats: 1 = ¼ bar, 2 = ½ bar, 4 = 1 bar, 8 = 2 bars */
  loopBeats: 1 | 2 | 4 | 8;
}

export interface SampleInfo {
  id: number;
  name: string;
  source: 'mic' | 'file';
  /** duration of what plays/exports (fx keep the length) */
  duration: number;
  /** duration of the untouched sample (analysis domain) */
  originalDuration: number;
  sampleRate: number;
  channels: number;
  /** waveform overview: interleaved [min, max] per bucket, −1..1 */
  peaks: number[];
}

export type EngineState = 'idle' | 'recording' | 'analyzing' | 'processing';
export type AiStatus = 'loading' | 'ready' | 'off';

export interface Transport {
  playing: boolean;
  /** seconds into the sample */
  position: number;
}

export type StemName = 'vocals' | 'drums' | 'bass' | 'other';
export const STEM_ORDER: StemName[] = ['vocals', 'drums', 'bass', 'other'];

export interface StemInfo {
  name: StemName;
  /** absolute (not normalised) so quiet/empty stems look quiet */
  peaks: number[];
  rmsDb: number;
  /** nothing of this kind in the sample (e.g. vocals in an instrumental) */
  empty: boolean;
}

export interface StemsState {
  status: 'unknown' | 'offline' | 'ready' | 'separating' | 'done' | 'error';
  /** sample id the stems belong to */
  sampleId: number | null;
  stems: StemInfo[];
  message?: string;
  /** seconds the separation took */
  seconds?: number;
  device?: string;
}

export interface OutputState {
  /** browser can route to a chosen device (setSinkId) */
  supported: boolean;
  devices: { id: string; label: string }[];
  current: string;
}

export interface PlayOptions {
  /** what to play: the (fx-processed) sample or one stem */
  source: 'main' | StemName;
  /** start position in seconds */
  from: number;
  loop: boolean;
  /** overlay a click on the detected beat grid to check the tempo */
  click: { bpm: number; offset: number } | null;
}

export interface Snapshot {
  state: EngineState;
  fx: Fx;
  stems: StemsState;
  sample: SampleInfo | null;
  analysis: Analysis | null;
  aiStatus: AiStatus;
}
