import { useEffect, useState, type ReactNode } from 'react';
import type { Actions, UiState } from '../state';
import { stemExportName } from '../state';
import { STEM_ORDER, type StemInfo } from '../types';

const LABEL: Record<string, string> = { vocals: 'vocals', drums: 'drums', bass: 'bass', other: 'melody / other' };

function Mini({ peaks }: { peaks: number[] }) {
  const n = peaks.length / 2;
  const W = 300, H = 30;
  const top: string[] = [], bot: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * W).toFixed(1);
    top.push(`${x},${(H / 2 - peaks[2 * i + 1] * H * 0.46).toFixed(1)}`);
    bot.push(`${x},${(H / 2 - peaks[2 * i] * H * 0.46).toFixed(1)}`);
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[30px] w-full">
      <path d={`M${top.join('L')}L${bot.reverse().join('L')}Z`} fill="#fff" fillOpacity="0.55" />
    </svg>
  );
}

function StemRow({ st, s, actions }: { st: StemInfo; s: UiState; actions: Actions }) {
  const playing = s.transport.playing && s.playingSource === st.name;
  const name = stemExportName(s, st.name);
  return (
    <div
      className={`flex items-center gap-3 rounded-[5px] border px-3 py-1.5 transition-colors ${playing ? 'border-white/60 bg-white/[0.07]' : 'border-white/[0.08] bg-ash-950/50'} ${st.empty ? 'opacity-45' : ''}`}
    >
      <button
        onClick={() => actions.playStem(st.name)}
        title={playing ? 'Stop' : `Play ${st.name}`}
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] ${playing ? 'bg-white text-black' : 'border border-white/25 text-white hover:border-white/60'}`}
      >
        {playing ? '■' : '▶'}
      </button>
      <div className="w-[92px] shrink-0">
        <div className="text-[12px] font-bold tracking-[-0.02em] text-white">
          {LABEL[st.name]}
          {st.empty && <span className="ml-1.5 text-[9px] font-normal text-white/50">empty</span>}
        </div>
        <div className="truncate text-[8px] text-white/30" title={name}>
          {name}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        {st.empty ? (
          <div className="flex h-[30px] items-center text-[9px] text-white/35">nothing of this in the sample</div>
        ) : (
          <Mini peaks={st.peaks} />
        )}
      </div>
      <button
        draggable
        onDragStart={(e) => actions.exportStem(st.name, e.dataTransfer)}
        onClick={() => actions.exportStem(st.name)}
        title="Download (or drag into your DAW)"
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-[4px] bg-white px-2.5 text-[10px] font-bold text-black hover:shadow-[0_0_16px_rgba(255,255,255,0.35)] active:cursor-grabbing"
      >
        ↓ wav
      </button>
    </div>
  );
}

export function StemsPanel({ s, actions }: { s: UiState; actions: Actions }) {
  const st = s.stems;
  const [elapsed, setElapsed] = useState(0);
  const fresh = st.sampleId === s.sample?.id;

  useEffect(() => {
    if (st.status !== 'separating') return;
    const t0 = performance.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed((performance.now() - t0) / 1000), 100);
    return () => clearInterval(id);
  }, [st.status]);

  const downloadAll = () => {
    st.stems.forEach((x, i) => setTimeout(() => actions.exportStem(x.name), i * 350));
  };

  return (
    <div className="flex h-full flex-col rounded-[6px] border border-white/[0.08] bg-ash-950/40 p-3.5">
      <div className="mb-3 flex items-baseline justify-between text-[9px] tracking-[0.1em] text-white/40">
        <span>
          <span className="text-white/20">// </span>stem splitter · demucs ai
        </span>
        <button onClick={() => actions.setView('analysis')} className="text-white/60 hover:text-white">
          ← back to analysis
        </button>
      </div>

      {!s.sample ? (
        <Center title="no sample loaded" sub="drop a file or record something first" />
      ) : st.status === 'offline' || st.status === 'unknown' ? (
        <Center
          title={st.status === 'unknown' ? 'checking stem service…' : 'stem service unreachable'}
          sub={
            <>
              check your connection and retry · running locally? start everything with <code className="text-white">npm run dev</code> in ui/
            </>
          }
          action={st.status === 'offline' ? { label: 'retry', onClick: actions.checkStems } : undefined}
        />
      ) : st.status === 'separating' ? (
        <div className="flex flex-1 flex-col justify-center gap-2">
          {STEM_ORDER.map((n, i) => (
            <div key={n} className="flex items-center gap-3 rounded-[5px] border border-white/[0.06] px-3 py-1.5">
              <span className="w-[120px] text-[12px] font-bold text-white/40">{LABEL[n]}</span>
              <div className="amari-sweep h-[22px] flex-1 rounded-[3px] bg-white/[0.04]" style={{ animationDelay: `${i * 120}ms` }} />
            </div>
          ))}
          <div className="mt-1 text-center text-[10px] text-white/50">
            separating… {Math.round((st.progress ?? 0) * 100)}% · {elapsed.toFixed(0)}s{st.message ? ` · ${st.message}` : ''}
          </div>
        </div>
      ) : st.status === 'done' && fresh ? (
        <div className="flex flex-1 flex-col gap-1.5">
          {st.stems.map((x) => (
            <StemRow key={x.name} st={x} s={s} actions={actions} />
          ))}
          <div className="mt-auto flex items-center justify-between pt-1 text-[9px] text-white/35">
            <span>
              split in {st.seconds?.toFixed(1)}s{s.fx.reverse || s.fx.halftime ? ' · stems follow your rev / ½ time settings' : ''}
            </span>
            <button onClick={downloadAll} className="rounded-[3px] border border-white/25 px-2 py-1 text-[10px] font-semibold text-white hover:border-white/60">
              ↓ download all 4
            </button>
          </div>
        </div>
      ) : (
        <Center
          title={st.status === 'error' ? 'separation failed' : 'split this sample into stems'}
          sub={st.status === 'error' ? st.message ?? 'unknown error' : 'vocals · drums · bass · melody — about 10 s per 5 s of audio'}
          action={{ label: st.status === 'error' ? 'try again' : '⑂ split stems', onClick: actions.splitStems, primary: true }}
        />
      )}
    </div>
  );
}

function Center({ title, sub, action }: { title: string; sub: ReactNode; action?: { label: string; onClick: () => void; primary?: boolean } }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <div className="text-[15px] font-bold tracking-[-0.02em] text-white/80">{title}</div>
      <div className="max-w-[420px] text-[10px] leading-relaxed text-white/40">{sub}</div>
      {action && (
        <button
          onClick={action.onClick}
          className={`mt-2 rounded-[4px] px-4 py-2 text-[12px] font-bold ${action.primary ? 'bg-white text-black hover:shadow-[0_0_24px_rgba(255,255,255,0.35)]' : 'border border-white/30 text-white hover:border-white/60'}`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
