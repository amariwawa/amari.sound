import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { bridge } from './bridge';
import type { AiStatus, Analysis, EngineState, Fx, KeyChoice, SampleInfo, StemName, StemsState, Transport } from './types';
import { NO_FX } from './engine/fx';
import { camelot, keyName, keyShort } from './music';

export interface UiState {
  ready: boolean;
  state: EngineState;
  sample: SampleInfo | null;
  analysis: Analysis | null;
  aiStatus: AiStatus;
  fx: Fx;
  stems: StemsState;
  level: number;
  recordTime: number;
  transport: Transport;
  logs: { id: number; text: string; t: number }[];
  // local choices
  /** user-picked tempo (half/double); null = detected */
  bpmChoice: number | null;
  /** key being explored in the key card; null = detected */
  focusKey: KeyChoice | null;
  loop: boolean;
  click: boolean;
  /** seek position when stopped (seconds) */
  cursor: number;
  view: 'analysis' | 'stems';
  playingSource: 'main' | StemName;
}

const initial: UiState = {
  ready: false,
  state: 'idle',
  sample: null,
  analysis: null,
  aiStatus: 'loading',
  fx: NO_FX,
  stems: { status: 'unknown', sampleId: null, stems: [] },
  level: 0,
  recordTime: 0,
  transport: { playing: false, position: 0 },
  logs: [],
  bpmChoice: null,
  focusKey: null,
  loop: true,
  click: false,
  cursor: 0,
  view: 'analysis',
  playingSource: 'main',
};

let logSeq = 0;

export const detectedKey = (s: UiState): KeyChoice | null => s.analysis?.key.ranking[0] ?? null;
/** tempo of the sample (detected or the user's half/double pick) — fx never change it */
export const baseBpm = (s: UiState): number | null => s.bpmChoice ?? s.analysis?.tempo.bpm ?? null;
export const currentBpm = baseBpm;

/** Tempo + first downbeat of the original sample (what halftime syncs to). */
export function sourceGrid(s: UiState): { bpm: number; offset: number } | null {
  const b = baseBpm(s);
  return b && s.analysis ? { bpm: b, offset: s.analysis.tempo.beatOffset } : null;
}

/** Beat grid of what you hear: reverse mirrors it; halftime keeps the tempo and the bars. */
export function fxGrid(s: UiState): { bpm: number; offset: number } | null {
  const g = sourceGrid(s);
  if (!g || !s.sample) return null;
  const spb = 60 / g.bpm;
  const o = s.fx.reverse ? (((s.sample.originalDuration - g.offset) % spb) + spb) % spb : g.offset;
  return { bpm: g.bpm, offset: o };
}

const fxTags = (fx: Fx) => [fx.reverse && 'rev', fx.halftime && 'halftime'].filter(Boolean) as string[];

/** e.g. "vocal-chop_Amin_8A_92bpm.wav" */
export function exportName(s: UiState) {
  if (!s.sample) return '';
  return fileName(s, []);
}

export const stemExportName = (s: UiState, stem: StemName) => fileName(s, [stem]);

function fileName(s: UiState, extra: string[]) {
  if (!s.sample) return '';
  const base = s.sample.name.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 40) || 'sample';
  const k = detectedKey(s);
  const bpm = currentBpm(s);
  const parts = [base, ...extra, ...fxTags(s.fx)];
  if (k) parts.push(keyShort(k), camelot(k));
  if (bpm) parts.push(`${Math.round(bpm)}bpm`);
  return `${parts.join('_')}.wav`;
}

export function infoText(s: UiState) {
  const k = detectedKey(s);
  const bpm = currentBpm(s);
  return [k ? `${keyName(k)} (${camelot(k)})` : null, bpm ? `${bpm} BPM` : null].filter(Boolean).join(' · ');
}

type PlayOpts = Partial<Pick<UiState, 'loop' | 'click' | 'bpmChoice' | 'playingSource'>>;

export function useAmari() {
  const [s, setS] = useState<UiState>(initial);
  const ref = useRef(s);
  ref.current = s;

  useEffect(() => {
    let alive = true;
    const patch = (p: Partial<UiState>) => alive && setS((prev) => ({ ...prev, ...p }));
    bridge.getSnapshot().then((snap) => patch({ ...snap, ready: true }));
    const offs = [
      bridge.on('state', (state) => patch({ state })),
      bridge.on('level', (level) => patch({ level })),
      bridge.on('recordTime', (recordTime) => patch({ recordTime })),
      bridge.on('sample', (sample) =>
        alive &&
        setS((prev) =>
          sample?.id === prev.sample?.id
            ? { ...prev, sample, cursor: 0 }
            : { ...prev, sample, bpmChoice: null, focusKey: null, cursor: 0, view: 'analysis' },
        ),
      ),
      bridge.on('fx', (fx) => patch({ fx })),
      bridge.on('stems', (stems) => patch({ stems })),
      bridge.on('analysis', (analysis) => patch({ analysis })),
      bridge.on('aiStatus', (aiStatus) => patch({ aiStatus })),
      bridge.on('transport', (transport) => patch({ transport })),
      bridge.on('log', (text) =>
        alive && setS((prev) => ({ ...prev, logs: [...prev.logs.slice(-40), { id: ++logSeq, text, t: performance.now() }] })),
      ),
    ];
    return () => {
      alive = false;
      offs.forEach((off) => off());
    };
  }, []);

  const playFrom = useCallback((from: number, over: PlayOpts = {}) => {
    const cur = { ...ref.current, ...over };
    const grid = fxGrid(cur);
    if (over.playingSource) setS((p) => ({ ...p, playingSource: over.playingSource! }));
    void bridge.play({
      source: cur.playingSource,
      from,
      loop: cur.loop,
      click: cur.click && grid ? grid : null,
    });
  }, []);

  /** apply a playback option; restart in place if playing */
  const setPlayOpt = useCallback(
    (over: PlayOpts) => {
      setS((p) => ({ ...p, ...over }));
      const cur = ref.current;
      if (cur.transport.playing) playFrom(cur.transport.position, over);
    },
    [playFrom],
  );

  return {
    state: s,
    toggleRecord: useCallback(() => {
      const st = ref.current.state;
      if (st === 'idle') void bridge.startRecording();
      else if (st === 'recording') void bridge.stopRecording();
    }, []),
    loadFile: useCallback((f: File) => void bridge.loadFile(f), []),
    togglePlay: useCallback(() => {
      const cur = ref.current;
      if (cur.transport.playing) {
        setS((p) => ({ ...p, cursor: cur.transport.position }));
        void bridge.stopPlayback();
      } else if (cur.sample) playFrom(cur.cursor, { playingSource: 'main' });
    }, [playFrom]),
    setFx: useCallback((fx: Fx) => {
      setS((p) => ({ ...p, fx, cursor: 0 }));
      void bridge.setFx(fx, sourceGrid(ref.current));
    }, []),
    setView: useCallback((view: UiState['view']) => {
      setS((p) => ({ ...p, view }));
      if (view === 'stems') void bridge.checkStems();
    }, []),
    splitStems: useCallback(() => void bridge.splitStems(), []),
    checkStems: useCallback(() => void bridge.checkStems(), []),
    playStem: useCallback(
      (stem: StemName) => {
        const cur = ref.current;
        if (cur.transport.playing && cur.playingSource === stem) void bridge.stopPlayback();
        else playFrom(0, { playingSource: stem });
      },
      [playFrom],
    ),
    exportStem: useCallback((stem: StemName, dt?: DataTransfer) => bridge.exportStem(stem, stemExportName(ref.current, stem), dt), []),
    seek: useCallback(
      (sec: number) => {
        setS((p) => ({ ...p, cursor: sec }));
        if (ref.current.transport.playing) playFrom(sec);
      },
      [playFrom],
    ),
    setLoop: useCallback((loop: boolean) => setPlayOpt({ loop }), [setPlayOpt]),
    setClick: useCallback((click: boolean) => setPlayOpt({ click }), [setPlayOpt]),
    chooseBpm: useCallback(
      (bpmChoice: number | null) => {
        setPlayOpt({ bpmChoice });
        // halftime loops follow the tempo — re-render with the new grid
        const cur = { ...ref.current, bpmChoice };
        if (cur.fx.halftime) void bridge.setFx(cur.fx, sourceGrid(cur));
      },
      [setPlayOpt],
    ),
    setFocusKey: useCallback((focusKey: KeyChoice | null) => setS((p) => ({ ...p, focusKey })), []),
    exportSample: useCallback((dt?: DataTransfer) => bridge.exportSample(exportName(ref.current), dt), []),
    copyInfo: useCallback(async () => {
      const text = infoText(ref.current);
      if (!text) return false;
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }, []),
  };
}

export type Actions = Omit<ReturnType<typeof useAmari>, 'state'>;

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}
