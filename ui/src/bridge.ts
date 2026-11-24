/**
 * bridge.ts — the ONLY module the UI uses to talk to the audio engine.
 *
 *   - SamplerBridge (bridges/web.ts): runs in the browser — mic recording, file decoding,
 *     BPM + key analysis (spectral + Basic Pitch AI), reverse/halftime, playback with beat-grid click,
 *     WAV export, stem separation via the local Demucs server (stems-server/).
 *   - JuceBridge (Stage 4): same contract over juce::WebBrowserComponent.
 */
import type { AiStatus, Analysis, EngineState, Fx, OutputState, PlayOptions, SampleInfo, Snapshot, StemName, StemsState, Transport } from './types';
import { SamplerBridge } from './bridges/web';

/** Events pushed from engine → UI. */
export interface BridgeEventMap {
  state: EngineState;
  /** Input level 0..1 while recording */
  level: number;
  /** Seconds recorded so far */
  recordTime: number;
  sample: SampleInfo | null;
  analysis: Analysis | null;
  aiStatus: AiStatus;
  fx: Fx;
  stems: StemsState;
  outputs: OutputState;
  transport: Transport;
  /** Engine log line (console overlay). Lines starting with "!" are errors. */
  log: string;
}

/** Calls from UI → engine. */
export interface Bridge {
  readonly kind: 'web' | 'juce';
  getSnapshot(): Promise<Snapshot>;
  /** Decode and analyse a dropped/browsed audio file. */
  loadFile(file: File): Promise<void>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<void>;
  /**
   * Reverse / halftime. Re-renders the playable sample; analysis stays on the original.
   * `grid` = tempo + first downbeat of the original, used to sync the halftime loops.
   */
  setFx(fx: Fx, grid: { bpm: number; offset: number } | null): Promise<void>;
  play(opts: PlayOptions): Promise<void>;
  stopPlayback(): Promise<void>;
  /** Route playback to an output device ('default' = system default). */
  setOutput(deviceId: string): Promise<void>;
  /**
   * Hand the sample to the host as a WAV named `filename`.
   * Browser: with a DataTransfer it attaches a DownloadURL (drag to Finder/DAW); without one it downloads.
   * JUCE: native external file drag.
   */
  exportSample(filename: string, target?: ExportTarget): void;
  /** Is the stem separator reachable? */
  checkStems(): Promise<void>;
  /** Split the current (original) sample into vocals / drums / bass / other. */
  splitStems(): Promise<void>;
  /** Export one stem (with current fx applied) as WAV. */
  exportStem(stem: StemName, filename: string, target?: ExportTarget): void;
  on<K extends keyof BridgeEventMap>(event: K, cb: (payload: BridgeEventMap[K]) => void): () => void;
}

export const MAX_RECORD_SECONDS = 60;

/**
 * Where an export goes. Browser: a DataTransfer (HTML drag) or nothing (download).
 * Plugin: 'drag' starts a native file drag into the DAW; nothing saves + reveals the file.
 */
export type ExportTarget = DataTransfer | 'drag';

function createBridge(): Bridge {
  // Stage 4: if (window.__JUCE__) return new JuceBridge();
  return new SamplerBridge();
}

export const bridge: Bridge = createBridge();

// Dev-only handle for automated testing (stripped from production builds).
if (import.meta.env.DEV) (window as unknown as { __amari: Bridge }).__amari = bridge;
