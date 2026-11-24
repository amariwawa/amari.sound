import { useEffect, useState } from 'react';
import type { UiState } from '../state';
import { currentBpm, detectedKey } from '../state';
import { camelot, keyName } from '../music';

const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

function useTicker(active: boolean, ms = 80) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return n;
}

function CommandLine({ s }: { s: UiState }) {
  const busy = s.state === 'analyzing' || !!s.analysis?.aiPending;
  const tick = useTicker(busy);
  const k = detectedKey(s);
  const bpm = currentBpm(s);
  let body;
  if (s.state === 'recording')
    body = (
      <>
        <span className="text-white">amari rec</span>
        <span className="ml-2 text-white">[{s.recordTime.toFixed(1)}s]</span>
      </>
    );
  else if (s.state === 'analyzing')
    body = (
      <>
        <span className="text-white">amari analyze</span>
        <span className="ml-2 text-white/50">{s.sample?.name}</span>
        <span className="ml-2 text-white">{SPINNER[tick % SPINNER.length]}</span>
      </>
    );
  else if (s.sample && k && bpm)
    body = (
      <>
        <span className="text-white/45">{s.sample.name} →</span>
        <span className="ml-2 text-white">
          {keyName(k)} · {camelot(k)} · {bpm} bpm
        </span>
        {s.analysis?.aiPending && <span className="ml-2 text-white/50">ai {SPINNER[tick % SPINNER.length]}</span>}
      </>
    );
  else body = <span className="text-white/40">drop a sample · or press rec</span>;
  return (
    <div className="flex min-w-0 items-center truncate text-[11px]">
      <span className="mr-2 text-white/30">$</span>
      {body}
      <span className="amari-cursor ml-1 inline-block h-[13px] w-[7px] shrink-0 bg-white/80" />
    </div>
  );
}

export function Header({ s }: { s: UiState }) {
  const ai = s.aiStatus;
  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-6 border-b border-white/[0.07] bg-ash-900/80 px-5">
      <div className="flex shrink-0 items-baseline gap-2">
        <span className="text-[20px] font-bold leading-none tracking-[-0.06em] text-white [text-shadow:0_0_18px_rgba(255,255,255,0.35)]">
          amarisound
        </span>
        <span className="rounded-[3px] border border-white/15 px-1 py-px text-[9px] text-white/40">sample analyzer</span>
      </div>
      <div className="min-w-0 flex-1">
        <CommandLine s={s} />
      </div>
      <div
        title="Basic Pitch neural network — refines key detection"
        className="flex shrink-0 items-center gap-1.5 rounded-[3px] border border-white/10 px-2 py-1 text-[9px] tracking-[0.08em] text-white/50"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            ai === 'ready' ? 'bg-white shadow-[0_0_6px_#fff]' : ai === 'loading' ? 'amari-cursor bg-white/70' : 'bg-white/20'
          }`}
        />
        ai {ai === 'ready' ? 'ready' : ai === 'loading' ? 'loading' : 'off'}
      </div>
    </header>
  );
}
