import type { ReactNode } from 'react';
import type { Actions, UiState } from '../state';
import { fxGrid, useSize } from '../state';
import { Console } from './Console';

function Btn({ on, onClick, children, title, disabled, primary }: {
  on?: boolean; onClick: () => void; children: ReactNode; title: string; disabled?: boolean; primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`flex h-8 items-center gap-1 rounded-[3px] px-2.5 text-[11px] md:h-[20px] md:px-2 md:text-[9px] font-semibold tracking-[0.06em] transition-all disabled:cursor-not-allowed disabled:opacity-30 ${
        primary
          ? on
            ? 'bg-white text-black shadow-[0_0_12px_rgba(255,255,255,0.5)]'
            : 'bg-white/90 text-black hover:bg-white'
          : on
            ? 'border border-white/60 bg-white/10 text-white'
            : 'border border-white/15 text-white/45 hover:text-white/80'
      }`}
    >
      {children}
    </button>
  );
}

export function Waveform({ s, actions }: { s: UiState; actions: Actions }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const sample = s.sample;
  const tempo = s.analysis?.tempo;
  const g = fxGrid(s);
  const busy = s.state !== 'idle';
  const playing = s.transport.playing && s.playingSource === 'main';
  const pos = playing ? s.transport.position : s.cursor;
  const dur = sample?.duration ?? 1;
  const x = (sec: number) => (sec / dur) * w;

  // waveform path
  let path = '';
  if (sample && w > 0) {
    const n = sample.peaks.length / 2;
    const mid = h / 2, amp = h * 0.44;
    const top: string[] = [], bot: string[] = [];
    for (let i = 0; i < n; i++) {
      const px = (i / (n - 1)) * w;
      top.push(`${px.toFixed(1)},${(mid - sample.peaks[2 * i + 1] * amp).toFixed(1)}`);
      bot.push(`${px.toFixed(1)},${(mid - sample.peaks[2 * i] * amp).toFixed(1)}`);
    }
    path = `M${top.join('L')}L${bot.reverse().join('L')}Z`;
  }

  // beat grid
  const grid: { x: number; bar: boolean; n: number }[] = [];
  if (sample && g && w > 0) {
    const spb = 60 / g.bpm;
    const first = Math.ceil(-g.offset / spb - 1e-6);
    for (let b = first, k = 0; k < 2000; b++, k++) {
      const t = g.offset + b * spb;
      if (t > dur) break;
      grid.push({ x: x(t), bar: (b - first) % 4 === 0, n: Math.floor((b - first) / 4) + 1 });
    }
  }
  const dense = grid.length > 0 && w / grid.length < 6;

  return (
    <div className="relative flex h-full flex-col rounded-[6px] border border-white/[0.08] bg-ash-950/60 md:block">
      <div className="z-10 px-3 pt-2 text-[9px] tracking-[0.1em] text-white/35 md:absolute md:left-3 md:top-2 md:p-0">
        <span className="text-white/20">// </span>waveform{g ? ' · beat grid' : ''}
        {s.fx.reverse && <span className="ml-2 text-white">reversed</span>}
        {s.fx.halftime && <span className="ml-2 text-white">½ time</span>}
      </div>
      <div className="z-10 flex flex-wrap items-center gap-1 px-3 pt-2 md:absolute md:right-2 md:top-1.5 md:flex-nowrap md:p-0">
        <Btn on={s.fx.reverse} onClick={() => actions.setFx({ ...s.fx, reverse: !s.fx.reverse })} title="Reverse the sample" disabled={!sample || busy}>
          ⇄ rev
        </Btn>
        <Btn
          on={s.fx.halftime}
          onClick={() => actions.setFx({ ...s.fx, halftime: !s.fx.halftime })}
          title="Halftime (HalfTime / Gross Beat style) — same length & BPM, half-speed feel, octave down"
          disabled={!sample || !tempo || busy}
        >
          ½ time
        </Btn>
        {s.fx.halftime && (
          <div className="flex h-8 overflow-hidden rounded-[3px] border border-white/20 text-[11px] md:h-[20px] md:text-[9px]" title="Halftime loop length">
            {([1, 2, 4, 8] as const).map((b) => (
              <button
                key={b}
                disabled={busy}
                onClick={() => actions.setFx({ ...s.fx, loopBeats: b })}
                title={b === 1 ? 'pitch-drop feel' : b === 8 ? 'whole 2-bar phrase' : 'rearranges the groove'}
                className={`px-1.5 ${s.fx.loopBeats === b ? 'bg-white font-semibold text-black' : 'text-white/50 hover:text-white'}`}
              >
                {b === 1 ? '¼' : b === 2 ? '½' : b === 4 ? '1 bar' : '2 bar'}
              </button>
            ))}
          </div>
        )}
        <span className="mx-0.5 hidden h-3 w-px bg-white/15 md:block" />
        <Btn on={s.loop} onClick={() => actions.setLoop(!s.loop)} title="Loop playback" disabled={!sample}>
          loop
        </Btn>
        <Btn on={s.click} onClick={() => actions.setClick(!s.click)} title="Click on the detected beat — check the BPM by ear" disabled={!tempo || busy}>
          click
        </Btn>
        <Btn primary on={playing} onClick={actions.togglePlay} title="Play / stop (Space)" disabled={!sample || busy}>
          {playing ? '■ stop' : '▶ play'}
        </Btn>
      </div>

      <div
        ref={ref}
        className={`relative mx-3 mb-3 mt-2 h-[96px] md:absolute md:inset-x-3 md:bottom-3 md:top-8 md:m-0 md:h-auto ${sample ? 'cursor-text' : ''}`}
        onClick={(e) => {
          if (!sample) return;
          const r = e.currentTarget.getBoundingClientRect();
          actions.seek(((e.clientX - r.left) / r.width) * dur);
        }}
      >
        {w > 0 && sample && (
          <svg width={w} height={h} className="block">
            {grid.map((g, i) =>
              g.bar || !dense ? (
                <g key={i}>
                  <line x1={g.x} x2={g.x} y1={g.bar ? 0 : h * 0.2} y2={g.bar ? h : h * 0.8} stroke="#fff" strokeOpacity={g.bar ? 0.22 : 0.07} />
                  {g.bar && w / Math.max(1, grid.length / 4) > 18 && (
                    <text x={g.x + 3} y={9} fontSize="8" fontFamily="var(--font-mono)" fill="#fff" fillOpacity="0.35">
                      {g.n}
                    </text>
                  )}
                </g>
              ) : null,
            )}
            <line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke="#fff" strokeOpacity="0.06" />
            <defs>
              <clipPath id="amari-played">
                <rect x={0} y={0} width={x(pos)} height={h} />
              </clipPath>
            </defs>
            <path d={path} fill="#fff" fillOpacity={0.28} />
            <path d={path} fill="#fff" fillOpacity={0.85} clipPath="url(#amari-played)" />
            {(playing || s.cursor > 0) && (
              <line x1={x(pos)} x2={x(pos)} y1={0} y2={h} stroke="#fff" strokeWidth="1.5" style={{ filter: 'drop-shadow(0 0 4px #fff)' }} />
            )}
          </svg>
        )}
        {!sample && (
          <div className="grid h-full place-items-center text-center">
            <div>
              <div className="text-[13px] font-semibold text-white/60">{s.state === 'recording' ? 'listening…' : 'no sample yet'}</div>
              <div className="mt-1 text-[10px] text-white/30">drop an audio file anywhere, browse, or press rec</div>
            </div>
          </div>
        )}
        {(s.state === 'analyzing' || s.state === 'processing') && <div className="amari-sweep pointer-events-none absolute inset-0" />}
      </div>
      <div className="pointer-events-none absolute bottom-2 right-2 z-10 w-[min(300px,calc(100%-16px))]">
        <Console state={s} />
      </div>
    </div>
  );
}
