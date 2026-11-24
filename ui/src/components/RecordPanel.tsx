import { useRef } from 'react';
import type { UiState } from '../state';
import { MAX_RECORD_SECONDS } from '../bridge';

const SEGMENTS = 30;

function LevelMeter({ level, active }: { level: number; active: boolean }) {
  const peak = useRef({ v: 0, t: 0 });
  const now = performance.now();
  if (level >= peak.current.v || now - peak.current.t > 900) peak.current = { v: level, t: now };
  const lit = Math.round(level * SEGMENTS);
  const peakIdx = active ? Math.min(SEGMENTS - 1, Math.round(peak.current.v * SEGMENTS) - 1) : -1;
  return (
    <div className="flex h-[6px] w-full gap-[2px]">
      {Array.from({ length: SEGMENTS }, (_, i) => {
        const on = active && i < lit;
        return (
          <div
            key={i}
            className="flex-1"
            style={{
              background: on ? `rgba(255,255,255,${0.35 + (0.65 * i) / SEGMENTS})` : i === peakIdx ? '#fff' : 'rgba(255,255,255,0.08)',
              boxShadow: on && i > SEGMENTS * 0.6 ? '0 0 6px rgba(255,255,255,0.6)' : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

const fmt = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${(sec % 60).toFixed(1).padStart(4, '0')}`;
const fmtDb = (lvl: number) => (lvl <= 0.001 ? '-inf' : (lvl * 60 - 60).toFixed(0));

export function RecordPanel({ s, onToggle }: { s: UiState; onToggle: () => void }) {
  const rec = s.state === 'recording';
  const busy = s.state === 'analyzing';
  const lvl = rec ? s.level : 0;
  return (
    <div className="flex items-center gap-4">
      <button
        onClick={onToggle}
        disabled={busy}
        aria-label={rec ? 'Stop recording' : 'Start recording'}
        className="group relative grid h-[84px] w-[84px] shrink-0 place-items-center rounded-full outline-none disabled:cursor-wait"
      >
        <span
          className="absolute inset-0 rounded-full transition-[box-shadow] duration-75"
          style={{ boxShadow: rec ? `0 0 ${14 + lvl * 40}px ${1 + lvl * 6}px rgba(255,255,255,${0.1 + lvl * 0.3})` : 'none' }}
        />
        {rec && <span className="absolute inset-0 rounded-full border border-white/50 [animation:amari-pulse_1.6s_ease-out_infinite]" />}
        <span className={`absolute inset-0 rounded-full border transition-colors ${rec ? 'border-white/80' : 'border-white/15 group-hover:border-white/40'}`} />
        {busy && <span className="absolute inset-[-1px] rounded-full border-2 border-transparent border-t-white [animation:amari-spin_0.9s_linear_infinite]" />}
        <span
          className={`relative grid h-[64px] w-[64px] place-items-center rounded-full border bg-gradient-to-b from-[#3a3b40] to-[#1c1d20] transition-transform duration-150
            shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_18px_rgba(0,0,0,0.5)]
            ${rec ? 'border-white/30' : 'border-white/[0.08] group-hover:scale-[1.03] group-active:scale-[0.96]'}`}
        >
          <span
            className={`block bg-white shadow-[0_0_16px_rgba(255,255,255,0.8)] transition-all duration-200 ${
              rec ? 'h-[17px] w-[17px] rounded-[2px]' : 'h-[17px] w-[17px] rounded-full'
            } ${busy ? 'opacity-25' : ''}`}
          />
        </span>
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-2 text-[11px] tabular-nums">
        <div className="flex items-baseline justify-between">
          <span className={`text-[15px] font-semibold ${rec ? 'text-white' : 'text-white/35'}`}>{fmt(rec ? s.recordTime : 0)}</span>
          <span className="text-[10px] text-white/30">/ {MAX_RECORD_SECONDS}s</span>
        </div>
        <LevelMeter level={lvl} active={rec} />
        <div className="flex justify-between text-[10px]">
          <span className={rec ? 'text-white/80' : 'text-white/30'}>{rec ? 'recording…' : busy ? 'analyzing…' : <><span className="md:hidden">tap to record</span><span className="hidden md:inline">R = record</span></>}</span>
          <span className={rec ? 'text-white/60' : 'text-white/25'}>{fmtDb(lvl)} dB</span>
        </div>
      </div>
    </div>
  );
}
