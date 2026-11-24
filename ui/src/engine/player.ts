/**
 * SamplePlayer — plays a sample or stem, and makes sure it is actually audible.
 *
 *  1. Primary path: the browser's native media player (<audio> with a WAV of the buffer).
 *     It is the most reliable route to the speakers in every browser and is not affected by
 *     Web Audio's suspended / stalled-context problems.
 *  2. It is started synchronously inside the click/key gesture, then VERIFIED: if its clock
 *     hasn't moved within 1.2 s, or the browser refuses, playback switches to Web Audio.
 *  3. The beat-grid click is scheduled on Web Audio, following the player's position.
 *  4. Output device can be chosen (setSinkId) for both paths.
 */
import { encodeWav, tick } from './audio';

export interface PlayRequest {
  buf: AudioBuffer;
  from: number;
  loop: boolean;
  click: { bpm: number; offset: number } | null;
}

export interface PlayerHooks {
  ctx(): AudioContext;
  position(sec: number): void;
  stopped(): void;
  log(line: string): void;
}

type SinkCapable = { setSinkId?: (id: string) => Promise<void> };

interface Current {
  req: PlayRequest;
  mode: 'element' | 'webaudio';
  timer: number;
  startedAt: number;
  verified: boolean;
  lastPos: number;
  loops: number;
  /** next click beat, in absolute seconds (loops × duration + position) */
  nextBeat: number;
  // web audio fallback
  src?: AudioBufferSourceNode;
  out?: GainNode;
  startCtx?: number;
}

const VERIFY_MS = 1200;

export class SamplePlayer {
  private el: HTMLAudioElement;
  private urls = new Map<AudioBuffer, string>();
  private cur: Current | null = null;
  private clickOut: GainNode | null = null;
  private preferWebAudio = false;

  constructor(private h: PlayerHooks) {
    this.el = new Audio();
    this.el.preload = 'auto';
    this.el.addEventListener('ended', () => {
      if (this.cur?.mode === 'element' && !this.cur.req.loop) this.stop();
    });
    this.el.addEventListener('error', () => {
      if (this.cur?.mode === 'element') {
        this.h.log(`! built-in player error (${this.el.error?.code ?? '?'}) — switching to the web audio engine`);
        this.toWebAudio();
      }
    });
  }

  get playing() {
    return this.cur !== null;
  }

  /** Must be called synchronously from the user's click / key press. */
  play(req: PlayRequest) {
    this.stop(false);
    const from = Math.max(0, Math.min(req.from, req.buf.duration - 0.01));
    req = { ...req, from };
    // keep Web Audio awake for the click track / fallback (inside the gesture)
    const ctx = this.h.ctx();
    if (ctx.state !== 'running') void ctx.resume();

    const cur: Current = {
      req,
      mode: 'element',
      timer: window.setInterval(() => this.tick(), 1000 / 40),
      startedAt: performance.now(),
      verified: false,
      lastPos: from,
      loops: 0,
      nextBeat: this.firstBeatAt(req, from),
    };
    this.cur = cur;

    if (this.preferWebAudio) {
      this.toWebAudio();
      return;
    }
    const url = this.urlFor(req.buf);
    if (this.el.src !== url) this.el.src = url;
    this.el.loop = req.loop;
    this.el.volume = 1;
    this.el.muted = false;
    const seek = () => {
      try {
        this.el.currentTime = from;
      } catch {
        /* not seekable yet */
      }
    };
    if (this.el.readyState >= 1) seek();
    else this.el.addEventListener('loadedmetadata', seek, { once: true });
    this.el.play().catch((e: Error) => {
      if (this.cur !== cur) return;
      this.h.log(`! the browser refused to start playback (${e.name}) — trying the web audio engine`);
      this.toWebAudio();
    });
  }

  stop(emit = true) {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    window.clearInterval(c.timer);
    this.el.pause();
    if (c.src) {
      try {
        c.src.stop();
      } catch {
        /* not started */
      }
      c.out?.disconnect();
    }
    if (emit) this.h.stopped();
  }

  /** Drop cached WAVs (new sample loaded). */
  forget() {
    this.stop();
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear();
    this.el.removeAttribute('src');
    this.el.load();
  }

  async setOutput(deviceId: string) {
    const tasks: Promise<void>[] = [];
    const el = this.el as HTMLAudioElement & SinkCapable;
    if (el.setSinkId) tasks.push(el.setSinkId(deviceId));
    const ctx = this.h.ctx() as AudioContext & SinkCapable;
    if (ctx.setSinkId) tasks.push(ctx.setSinkId(deviceId));
    await Promise.all(tasks);
  }

  static get canChooseOutput() {
    return typeof (HTMLMediaElement.prototype as SinkCapable).setSinkId === 'function';
  }

  // ───────────── internals ─────────────

  private urlFor(buf: AudioBuffer) {
    let u = this.urls.get(buf);
    if (!u) {
      u = URL.createObjectURL(new Blob([encodeWav(buf) as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }));
      this.urls.set(buf, u);
    }
    return u;
  }

  private firstBeatAt(req: PlayRequest, from: number) {
    if (!req.click) return Infinity;
    const spb = 60 / req.click.bpm;
    return req.click.offset + Math.ceil((from - req.click.offset) / spb - 1e-6) * spb;
  }

  private position(c: Current): number {
    const dur = c.req.buf.duration;
    if (c.mode === 'element') return this.el.currentTime;
    const ctx = this.h.ctx();
    const p = c.req.from + Math.max(0, ctx.currentTime - (c.startCtx ?? ctx.currentTime));
    return c.req.loop ? p % dur : Math.min(p, dur);
  }

  private tick() {
    const c = this.cur;
    if (!c) return;
    const dur = c.req.buf.duration;
    const pos = this.position(c);

    // verify that sound is really flowing: the clock must make small steady forward steps while
    // not paused (a seek jump, or a "playing" player whose clock never moves, does not count)
    if (!c.verified) {
      const step = pos - c.lastPos;
      const moving = step > 0.001 && step < 0.5 && (c.mode !== 'element' || (!this.el.paused && this.el.readyState >= 2));
      if (moving) {
        c.verified = true;
      } else if (performance.now() - c.startedAt > VERIFY_MS) {
        if (c.mode === 'element') {
          this.h.log('! built-in player is not advancing — switching to the web audio engine');
          this.toWebAudio();
        } else {
          this.h.log("! no audio engine is running — check System Settings → Sound → Output and that this tab isn't muted");
          this.stop();
        }
        return;
      }
    }

    if (pos < c.lastPos - 0.25) c.loops++; // wrapped around
    c.lastPos = pos;
    if (!c.req.loop && c.mode === 'webaudio' && pos >= dur - 0.005) return this.stop();
    this.h.position(pos);

    // click track: schedule beats ~150 ms ahead on Web Audio, following loop wraps
    const click = c.req.click;
    if (click) {
      const ctx = this.h.ctx();
      if (ctx.state !== 'running') return;
      if (!this.clickOut || this.clickOut.context !== ctx) {
        this.clickOut = ctx.createGain();
        this.clickOut.connect(ctx.destination);
      }
      const spb = 60 / click.bpm;
      const abs = c.loops * dur + pos;
      for (let guard = 0; guard < 32 && c.nextBeat <= abs + 0.15; guard++) {
        const within = c.nextBeat - Math.floor(c.nextBeat / dur) * dur; // position inside the loop
        if (within >= dur - 1e-6 || (!c.req.loop && c.nextBeat >= dur)) {
          c.nextBeat = Infinity;
          break;
        }
        if (c.nextBeat >= abs - 0.01) {
          const beatIdx = Math.round((within - click.offset) / spb);
          tick(ctx, this.clickOut, ctx.currentTime + (c.nextBeat - abs), ((beatIdx % 4) + 4) % 4 === 0);
        }
        // next beat; when passing the loop end, restart on the first beat of the next loop
        const next = c.nextBeat + spb;
        const loopStart = Math.floor(c.nextBeat / dur) * dur;
        if (next - loopStart >= dur) {
          const first = click.offset - Math.floor(click.offset / spb) * spb;
          c.nextBeat = loopStart + dur + first;
        } else c.nextBeat = next;
      }
    }
  }

  private toWebAudio() {
    const c = this.cur;
    if (!c) return;
    this.el.pause();
    const ctx = this.h.ctx();
    const from = this.position(c);
    const start = () => {
      if (this.cur !== c) return;
      const out = ctx.createGain();
      out.connect(ctx.destination);
      const src = ctx.createBufferSource();
      src.buffer = c.req.buf;
      src.loop = c.req.loop;
      src.connect(out);
      c.startCtx = ctx.currentTime + 0.03;
      src.start(c.startCtx, Math.max(0, Math.min(from, c.req.buf.duration - 0.01)));
      c.src = src;
      c.out = out;
      c.mode = 'webaudio';
      c.req = { ...c.req, from };
      c.verified = false;
      c.startedAt = performance.now();
      this.preferWebAudio = true; // remember for this session
      this.h.log(`  playing through web audio · ${ctx.sampleRate} Hz`);
    };
    if (ctx.state === 'running') start();
    else
      ctx.resume().then(start, () => {
        this.h.log('! the browser is blocking audio — click anywhere on the page, then press play again');
        this.stop();
      });
  }
}
