import { useEffect, useState } from 'react';
import type { UiState } from '../state';

const VISIBLE = 4;
const LINGER_MS = 3500;
const ERROR_LINGER_MS = 12000;

/** Engine log overlay — streams while recording/analyzing, fades out when idle. */
export function Console({ state }: { state: UiState }) {
  const [now, setNow] = useState(() => performance.now());
  const last = state.logs[state.logs.length - 1];
  const busy = state.state !== 'idle' || !!state.analysis?.aiPending;

  const linger = state.logs.slice(-VISIBLE).some((l) => l.text.startsWith('!')) ? ERROR_LINGER_MS : LINGER_MS;
  useEffect(() => {
    if (!last || busy) return;
    const id = setTimeout(() => setNow(performance.now()), linger + 50);
    return () => clearTimeout(id);
  }, [last, busy, linger]);

  const show = !!last && (busy || Math.max(now, performance.now()) - last.t < linger);
  // phones: the log would cover the waveform — only show it when something went wrong
  const hasError = state.logs.slice(-VISIBLE).some((l) => l.text.startsWith('!'));
  const lines = state.logs.slice(-VISIBLE);

  return (
    <div
      className={`${hasError ? '' : 'hidden md:block'} ml-auto w-[300px] max-w-full rounded-[4px] text-[9.5px] border border-white/10 bg-ash-950/90 px-3 py-2 text-[10px] leading-[1.55] shadow-[0_10px_30px_rgba(0,0,0,0.7)] backdrop-blur-sm transition-opacity duration-500 ${
        show ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {lines.map((l, i) => (
        <div
          key={l.id}
          className={`overflow-hidden whitespace-pre text-ellipsis [animation:amari-type_260ms_steps(24)] ${
            l.text.startsWith('!') ? 'font-semibold text-white' : l.text.startsWith('$') ? 'text-white' : l.text.startsWith('✓') ? 'font-semibold text-white' : 'text-white/50'
          }`}
          style={{ opacity: 0.45 + (0.55 * (i + 1)) / lines.length }}
        >
          {l.text}
        </div>
      ))}
    </div>
  );
}
