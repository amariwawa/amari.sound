/**
 * SamplerBridge — the sample-analysis engine running in the browser.
 *
 *   file ─► decodeAudioData ─┐
 *   mic  ─► AudioWorklet ─► trim silence ─┤
 *                                          ├─► mono 22.05 kHz ─► tempo (onset autocorrelation)
 *                                          │                  └► key (spectral chroma + bass tonic)
 *                                          └─► Basic Pitch AI notes ─► key refined (spectral + AI)
 *   original ─► fx (reverse / halftime) ─► playback · waveform · export
 *   original ─► 44.1k stereo WAV ─► local Demucs server ─► vocals / drums / bass / other (+ same fx)
 */
import { MAX_RECORD_SECONDS, type Bridge, type BridgeEventMap } from '../bridge';
import type { AiStatus, Analysis, EngineState, Fx, PlayOptions, SampleInfo, Snapshot, StemName, StemsState } from '../types';
import { STEM_ORDER } from '../types';
import { NO_FX, applyFx, fxActive, fxKey, type FxGrid } from '../engine/fx';
import { separate, stemHealth } from '../engine/stems';
import { keyName } from '../music';
import { ANALYSIS_SR, detectTempo } from '../engine/tempo';
import { analyzeKey } from '../engine/keydetect';
import { aiBackend, preloadAi, transcribe } from '../engine/ai';
import { encodeWav, rmsDb, tick, toAnalysisMono, toStereo44k, trimSilence, waveformPeaks } from '../engine/audio';
import { recorderWorkletUrl, type RecorderChunk } from '../engine/recorderWorklet';

const AI_MAX_SECONDS = 45;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Listener = (payload: never) => void;
class Emitter<M extends object> {
  private l = new Map<keyof M, Set<Listener>>();
  on<K extends keyof M>(e: K, cb: (p: M[K]) => void) {
    if (!this.l.has(e)) this.l.set(e, new Set());
    this.l.get(e)!.add(cb as Listener);
    return () => void this.l.get(e)?.delete(cb as Listener);
  }
  emit<K extends keyof M>(e: K, p: M[K]) {
    this.l.get(e)?.forEach((cb) => (cb as (p: M[K]) => void)(p));
  }
}

interface Playback {
  buf: AudioBuffer;
  src: AudioBufferSourceNode;
  out: GainNode;
  timer: number;
  startCtx: number;
  from: number;
  loop: boolean;
  click: PlayOptions['click'];
  clickIter: number;
  clickBeat: number;
}

let sampleSeq = 0;
let recSeq = 0;

export class SamplerBridge implements Bridge {
  readonly kind = 'web' as const;
  private em = new Emitter<BridgeEventMap>();
  private state: EngineState = 'idle';
  private sample: SampleInfo | null = null;
  /** untouched sample (analysis domain) */
  private original: AudioBuffer | null = null;
  /** original with fx applied — what plays and exports */
  private buffer: AudioBuffer | null = null;
  private fx: Fx = NO_FX;
  private fxGrid: FxGrid | null = null;
  private stems: StemsState = { status: 'unknown', sampleId: null, stems: [] };
  private stemOriginal = new Map<StemName, AudioBuffer>();
  private stemCache = new Map<string, AudioBuffer>();
  private analysis: Analysis | null = null;
  private aiStatus: AiStatus = 'loading';

  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private micNodes: AudioNode[] = [];
  private workletLoaded = new WeakSet<AudioContext>();
  private level = 0;
  private rec: { chunks: Float32Array[]; timer: number; t0: number } | null = null;
  private pb: Playback | null = null;
  private playedOnce = false;
  private deviceChanged = false;

  constructor() {
    // Browsers start audio locked until the user interacts. Create/unlock the engine on the very
    // first click or key press, so a dropped file can always be played.
    const unlock = () => {
      const ctx = this.ensureCtx();
      if (ctx.state !== 'running') void ctx.resume();
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    navigator.mediaDevices?.addEventListener?.('devicechange', () => {
      this.deviceChanged = true;
      this.log('  audio devices changed');
    });

    preloadAi()
      .then(() => this.setAi('ready'))
      .catch((e) => {
        this.setAi('off');
        this.log(`! ai model unavailable (${(e as Error).message}) — spectral analysis only`);
      });
  }

  // ───────────── contract ─────────────

  async getSnapshot(): Promise<Snapshot> {
    setTimeout(() => {
      this.log('$ amari --mode sample-analyzer');
      this.log('  drop a sample or press rec');
    }, 250);
    void this.checkStems();
    return {
      state: this.state, fx: this.fx, stems: this.stems,
      sample: this.sample, analysis: this.analysis, aiStatus: this.aiStatus,
    };
  }

  async loadFile(file: File) {
    if (this.state !== 'idle') return;
    const ctx = this.ensureCtx();
    this.stopPb();
    this.setState('analyzing');
    this.log(`$ amari load "${file.name}"`);
    try {
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      await this.ingest(buf, file.name.replace(/\.[^.]+$/, ''), 'file');
    } catch (e) {
      this.log(`! could not decode this file (${(e as Error).name ?? 'error'}) — try wav, mp3, aiff, m4a or flac`);
      this.setState('idle');
    }
  }

  async startRecording() {
    if (this.state !== 'idle') return;
    const ctx = this.ensureCtx(); // created inside the click gesture
    this.stopPb();
    this.setState('recording');
    if (!(await this.ensureMic(ctx))) {
      this.setState('idle');
      return;
    }
    await ctx.resume();
    this.rec = {
      chunks: [],
      t0: ctx.currentTime,
      timer: window.setInterval(() => {
        if (!this.rec || !this.ctx) return;
        const t = this.ctx.currentTime - this.rec.t0;
        this.em.emit('level', this.level);
        this.em.emit('recordTime', t);
        if (t >= MAX_RECORD_SECONDS) void this.stopRecording();
      }, 1000 / 30),
    };
    this.log(`$ amari rec  (max ${MAX_RECORD_SECONDS}s · press again to stop)`);
  }

  async stopRecording() {
    const rec = this.rec;
    if (this.state !== 'recording' || !rec || !this.ctx) return;
    window.clearInterval(rec.timer);
    await sleep(60);
    this.rec = null;
    // Give the mic back right away: an open mic keeps Bluetooth headphones in low-quality
    // "call" mode and can stall or reroute playback on macOS.
    this.releaseMic();
    this.em.emit('level', 0);
    this.setState('analyzing');

    const len = rec.chunks.reduce((s, c) => s + c.length, 0);
    const raw = new Float32Array(len);
    let o = 0;
    for (const c of rec.chunks) { raw.set(c, o); o += c.length; }
    const trimmed = trimSilence(raw, this.ctx.sampleRate);
    if (trimmed.length < this.ctx.sampleRate * 0.25) {
      this.log('! nothing usable recorded — check the mic input level');
      this.setState('idle');
      return;
    }
    // normalise to −1 dBFS
    let peak = 0;
    for (let i = 0; i < trimmed.length; i++) peak = Math.max(peak, Math.abs(trimmed[i]));
    const g = peak > 0 ? Math.min(40, 0.89 / peak) : 1;
    const buf = this.ctx.createBuffer(1, trimmed.length, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < trimmed.length; i++) ch[i] = trimmed[i] * g;
    this.log(`  captured ${(len / this.ctx.sampleRate).toFixed(1)}s → trimmed to ${buf.duration.toFixed(1)}s`);
    await this.ingest(buf, `amari_rec_${String(++recSeq).padStart(2, '0')}`, 'mic');
  }

  async play(opts: PlayOptions) {
    if (!this.buffer || this.state === 'recording') return;
    this.stopPb(false);
    const ctx = await this.readyCtx();
    if (!ctx) return;
    const buf = opts.source === 'main' ? this.buffer : this.stemBuffer(opts.source);
    if (!buf) {
      this.log(`! nothing to play for "${opts.source}" — split stems again`);
      return;
    }
    if (!this.playedOnce) {
      this.playedOnce = true;
      this.log(`  audio out ${ctx.sampleRate} Hz · if you hear nothing, check your mac's output device / volume`);
    }
    this.stopPb(false);
    const out = ctx.createGain();
    out.connect(ctx.destination);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = opts.loop;
    src.connect(out);
    const from = Math.max(0, Math.min(opts.from, buf.duration - 0.01));
    const startCtx = ctx.currentTime + 0.05;
    src.start(startCtx, from);
    if (!opts.loop) src.onended = () => this.pb?.src === src && this.stopPb();

    const pb: Playback = {
      buf, src, out, startCtx, from, loop: opts.loop, click: opts.click,
      clickIter: 0, clickBeat: 0,
      timer: window.setInterval(() => this.pbTick(), 1000 / 60),
    };
    if (opts.click) {
      const spb = 60 / opts.click.bpm;
      pb.clickBeat = Math.ceil((from - opts.click.offset) / spb - 1e-6);
    }
    this.pb = pb;
    this.pbTick();
  }

  async stopPlayback() {
    this.stopPb();
  }

  exportSample(filename: string, dataTransfer?: DataTransfer) {
    if (this.buffer) this.writeWav(this.buffer, filename, dataTransfer);
  }

  exportStem(stem: StemName, filename: string, dataTransfer?: DataTransfer) {
    const buf = this.stemBuffer(stem);
    if (buf) this.writeWav(buf, filename, dataTransfer);
  }

  async setFx(fx: Fx, grid: FxGrid | null) {
    this.fx = fx;
    this.fxGrid = grid;
    this.em.emit('fx', fx);
    if (!this.original || this.state !== 'idle') return;
    this.stopPb();
    this.setState('processing');
    await sleep(20);
    const t = performance.now();
    this.buffer = applyFx(this.ensureCtx(), this.original, fx, grid);
    this.stemCache.clear();
    this.sample = { ...this.sample!, duration: this.buffer.duration, peaks: waveformPeaks(this.buffer) };
    this.em.emit('sample', this.sample);
    const loops: Record<number, string> = { 1: '1/4 bar', 2: '1/2 bar', 4: '1 bar', 8: '2 bars' };
    const desc = [fx.reverse && 'reverse', fx.halftime && `halftime loop=${loops[fx.loopBeats]} @ ${grid?.bpm ?? '?'} bpm`].filter(Boolean);
    this.log(`$ amari fx ${desc.length ? desc.join(' + ') : 'off'}  (${(performance.now() - t).toFixed(0)} ms)`);
    this.setState('idle');
  }

  async checkStems() {
    const h = await stemHealth();
    if (this.stems.status === 'separating') return;
    if (!h) this.setStems({ status: 'offline', message: undefined });
    else if (this.stems.status !== 'done' || this.stems.sampleId !== this.sample?.id)
      this.setStems({ status: 'ready', device: h.device, message: undefined });
  }

  async splitStems() {
    const orig = this.original;
    const id = this.sample?.id ?? null;
    if (!orig || this.stems.status === 'separating') return;
    const h = await stemHealth();
    if (!h) {
      this.setStems({ status: 'offline' });
      this.log('! stem server offline — run: npm run stems:setup (once), then npm run dev');
      return;
    }
    this.setStems({ status: 'separating', sampleId: id, stems: [], message: h.loaded ? undefined : 'loading model…', device: h.device });
    this.log(`$ amari stems --model ${h.model} --device ${h.device}`);
    try {
      const wav = encodeWav(await toStereo44k(orig));
      const res = await separate(wav);
      if (this.sample?.id !== id) return;
      const ctx = this.ensureCtx();
      this.stemOriginal.clear();
      this.stemCache.clear();
      for (const st of res.stems) this.stemOriginal.set(st.name as StemName, await ctx.decodeAudioData(st.data));
      // shared scale so a quiet stem looks quiet next to a loud one
      const all = STEM_ORDER.filter((n) => this.stemOriginal.has(n)).map((name) => ({ name, buf: this.stemBuffer(name)! }));
      const raw = all.map((x) => waveformPeaks(x.buf, 300, false));
      const top = Math.max(1e-6, ...raw.flat().map(Math.abs));
      const stems = all.map((x, i) => {
        const db = rmsDb(x.buf);
        return { name: x.name, peaks: raw[i].map((v) => v / top), rmsDb: db, empty: db < -50 };
      });
      const empty = stems.filter((x) => x.empty).map((x) => x.name);
      if (empty.length) this.log(`  empty stems: ${empty.join(', ')} (not in this sample)`);
      this.setStems({ status: 'done', sampleId: id, stems, seconds: res.seconds, message: undefined });
      this.log(`✓ ${stems.length} stems in ${res.seconds.toFixed(1)}s`);
    } catch (e) {
      this.setStems({ status: 'error', message: (e as Error).message });
      this.log(`! stem split failed: ${(e as Error).message}`);
    }
  }

  private stemBuffer(name: StemName): AudioBuffer | null {
    const orig = this.stemOriginal.get(name);
    if (!orig || this.stems.sampleId !== this.sample?.id) return null;
    if (!fxActive(this.fx)) return orig;
    const k = `${name}:${fxKey(this.fx, this.fxGrid?.bpm)}`;
    let b = this.stemCache.get(k);
    if (!b) {
      b = applyFx(this.ensureCtx(), orig, this.fx, this.fxGrid);
      this.stemCache.set(k, b);
    }
    return b;
  }

  private setStems(p: Partial<StemsState>) {
    this.stems = { ...this.stems, ...p };
    this.em.emit('stems', this.stems);
  }

  private writeWav(buf: AudioBuffer, filename: string, dataTransfer?: DataTransfer) {
    const url = URL.createObjectURL(new Blob([encodeWav(buf) as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }));
    if (dataTransfer) {
      dataTransfer.effectAllowed = 'copy';
      dataTransfer.setData('DownloadURL', `audio/wav:${filename}:${url}`);
      dataTransfer.setData('text/plain', filename);
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    }
    this.log(`$ amari export ${filename}`);
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  }

  on<K extends keyof BridgeEventMap>(event: K, cb: (payload: BridgeEventMap[K]) => void) {
    return this.em.on(event, cb);
  }

  // ───────────── analysis ─────────────

  private async ingest(buf: AudioBuffer, name: string, source: SampleInfo['source']) {
    const id = ++sampleSeq;
    this.original = buf;
    this.buffer = buf;
    if (fxActive(this.fx)) {
      this.fx = NO_FX;
      this.em.emit('fx', this.fx);
    }
    this.stemOriginal.clear();
    this.stemCache.clear();
    if (this.stems.status !== 'offline') this.setStems({ status: this.stems.status === 'unknown' ? 'unknown' : 'ready', sampleId: null, stems: [], message: undefined });
    void this.checkStems();
    this.sample = {
      id, name, source,
      duration: buf.duration,
      originalDuration: buf.duration,
      sampleRate: buf.sampleRate,
      channels: buf.numberOfChannels,
      peaks: waveformPeaks(buf),
    };
    this.analysis = null;
    this.em.emit('sample', this.sample);
    this.em.emit('analysis', null);
    this.log(`  ${buf.duration.toFixed(2)}s · ${buf.numberOfChannels}ch · ${buf.sampleRate} Hz`);

    await sleep(20); // let the UI paint
    const mono = await toAnalysisMono(buf);
    const t = performance.now();
    const tempo = detectTempo(mono);
    this.log(`  tempo.onset-acf   ${tempo.bpm} bpm  conf ${(tempo.confidence * 100).toFixed(0)}%${tempo.fromLoopLength ? `  (exact ${tempo.loopBars}-bar loop)` : ''}`);
    const key = analyzeKey(mono);
    const best = key.ranking[0];
    this.log(`  key.chroma        ${keyName(best)}  r=${best.score.toFixed(2)}  tune ${key.tuningCents >= 0 ? '+' : ''}${key.tuningCents}c  (${(performance.now() - t).toFixed(0)} ms)`);

    this.analysis = { sampleId: id, tempo, key, aiPending: this.aiStatus !== 'off', aiNotes: 0 };
    this.em.emit('analysis', this.analysis);
    this.setState('idle');

    if (this.aiStatus === 'off') return;
    try {
      const ta = performance.now();
      this.log('  ai.basic-pitch    listening for notes…');
      const clip = mono.subarray(0, Math.min(mono.length, AI_MAX_SECONDS * ANALYSIS_SR));
      const notes = await transcribe([clip], ANALYSIS_SR);
      if (this.sample?.id !== id) return; // a newer sample replaced this one
      const refined = analyzeKey(mono, notes);
      const nb = refined.ranking[0];
      this.analysis = { ...this.analysis!, key: refined, aiPending: false, aiNotes: notes.length };
      this.em.emit('analysis', this.analysis);
      this.log(`  ai.notes          n=${notes.length}  (${(performance.now() - ta).toFixed(0)} ms, ${aiBackend()})`);
      this.log(
        nb.tonic === best.tonic && nb.mode === best.mode
          ? `✓ ${keyName(nb)} · ${tempo.bpm} bpm  (ai agrees)`
          : `✓ ${keyName(nb)} · ${tempo.bpm} bpm  (ai refined from ${keyName(best)})`,
      );
    } catch (e) {
      if (this.sample?.id !== id) return;
      this.analysis = { ...this.analysis!, aiPending: false };
      this.em.emit('analysis', this.analysis);
      this.log(`! ai pass failed (${(e as Error).message}) — keeping spectral result`);
    }
  }

  // ───────────── audio plumbing ─────────────

  private log(line: string) {
    this.em.emit('log', line);
  }
  private setState(s: EngineState) {
    this.state = s;
    this.em.emit('state', s);
  }
  private setAi(s: AiStatus) {
    this.aiStatus = s;
    this.em.emit('aiStatus', s);
  }

  private ensureCtx() {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx.onstatechange = () => {
        if (this.ctx?.state === 'suspended' && this.pb) this.log('! audio was paused by the system — press play again');
      };
    }
    return this.ctx;
  }

  /**
   * A running AudioContext whose clock is actually moving. If the output device changed
   * (headphones, AirPods, interface) Chrome's context can freeze silently — detect that and
   * rebuild the audio engine.
   */
  private async readyCtx(): Promise<AudioContext | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctx = this.ensureCtx();
      await Promise.race([ctx.resume(), sleep(800)]);
      if (ctx.state !== 'running') {
        this.log('! the browser is blocking audio — click anywhere on the page, then press play again');
        return null;
      }
      const t0 = ctx.currentTime;
      await sleep(150);
      if (ctx.currentTime > t0) {
        if (!this.playedOnce || this.deviceChanged) {
          this.playedOnce = true;
          this.deviceChanged = false;
          this.log(`  audio out ${ctx.sampleRate} Hz · output latency ${Math.round(((ctx.outputLatency || ctx.baseLatency) ?? 0) * 1000)} ms`);
        }
        return ctx;
      }
      this.log('! audio output stalled (output device changed?) — restarting the audio engine');
      this.releaseMic();
      try {
        await ctx.close();
      } catch {
        /* already closed */
      }
      this.ctx = null;
    }
    this.log("! audio output isn't responding — check System Settings → Sound → Output, then reload the page");
    return null;
  }

  private releaseMic() {
    this.micNodes.forEach((n) => n.disconnect());
    this.micNodes = [];
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private async ensureMic(ctx: AudioContext) {
    if (this.stream) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
      if (!this.workletLoaded.has(ctx)) {
        await ctx.audioWorklet.addModule(recorderWorkletUrl());
        this.workletLoaded.add(ctx);
      }
      const src = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, 'amari-recorder', { channelCount: 1, channelCountMode: 'explicit' });
      const mute = ctx.createGain();
      mute.gain.value = 0;
      src.connect(node).connect(mute).connect(ctx.destination);
      this.micNodes = [src, node, mute];
      node.port.onmessage = (e: MessageEvent<RecorderChunk>) => this.onChunk(e.data);
      this.stream = stream;
      this.log(`  input: ${stream.getAudioTracks()[0]?.label || 'default microphone'} @ ${ctx.sampleRate} Hz`);
      return true;
    } catch (err) {
      const name = (err as Error)?.name;
      this.log(
        name === 'NotAllowedError'
          ? '! microphone permission denied — allow it in the address bar and retry'
          : `! microphone unavailable (${name ?? 'error'})`,
      );
      return false;
    }
  }

  private onChunk(c: RecorderChunk) {
    const db = 20 * Math.log10(c.rms + 1e-9);
    this.level = Math.max(Math.max(0, Math.min(1, (db + 60) / 60)), this.level * 0.82);
    this.rec?.chunks.push(c.data);
  }

  private pbTick() {
    const pb = this.pb;
    const ctx = this.ctx;
    if (!pb || !ctx || !this.buffer) return;
    const dur = pb.buf.duration;
    const elapsed = Math.max(0, ctx.currentTime - pb.startCtx);
    let pos = pb.from + elapsed;
    if (pb.loop) pos = pos % dur;
    else if (pos >= dur) return this.stopPb();
    this.em.emit('transport', { playing: true, position: pos });

    // schedule click ticks ~200 ms ahead on the beat grid, following loop wraps
    if (pb.click) {
      const spb = 60 / pb.click.bpm;
      const firstBeat = Math.ceil(-pb.click.offset / spb - 1e-6);
      for (let guard = 0; guard < 64; guard++) {
        const beatTime = pb.click.offset + pb.clickBeat * spb;
        if (beatTime >= dur) {
          if (!pb.loop) break;
          pb.clickIter++;
          pb.clickBeat = firstBeat;
          continue;
        }
        const ctxTime = pb.startCtx + pb.clickIter * dur + beatTime - pb.from;
        if (ctxTime > ctx.currentTime + 0.2) break;
        if (ctxTime >= ctx.currentTime - 0.005) tick(ctx, pb.out, ctxTime, (pb.clickBeat - firstBeat) % 4 === 0);
        pb.clickBeat++;
      }
    }
  }

  private stopPb(emit = true) {
    const pb = this.pb;
    if (!pb) return;
    this.pb = null;
    window.clearInterval(pb.timer);
    try { pb.src.stop(); } catch { /* not started */ }
    pb.out.disconnect();
    if (emit) this.em.emit('transport', { playing: false, position: 0 });
  }
}
