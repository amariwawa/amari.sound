import type { UiState } from '../state';
import { currentBpm, detectedKey } from '../state';
import { camelot, keyName } from '../music';

export function StatusBar({ s }: { s: UiState }) {
  const st = s.state;
  const k = detectedKey(s);
  const bpm = currentBpm(s);
  const a = s.analysis;
  const items = s.sample
    ? [
        k ? `${keyName(k)} ${camelot(k)}` : 'key —',
        bpm ? `${bpm} bpm` : 'bpm —',
        a ? `tune ${a.key.tuningCents >= 0 ? '+' : ''}${a.key.tuningCents}c` : null,
        `${s.sample.duration.toFixed(2)}s`,
        s.loop ? 'loop' : null,
        s.click ? 'click' : null,
      ].filter(Boolean)
    : ['no sample'];
  return (
    <footer className="relative z-10 flex h-6 shrink-0 items-center justify-between border-t border-white/[0.07] bg-ash-950/80 px-4 text-[10px] text-white/35">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              st === 'recording' ? 'amari-cursor bg-white' : st === 'analyzing' ? 'bg-white/70' : 'bg-white/30'
            }`}
          />
          <span className={st === 'idle' ? '' : 'text-white'}>{s.transport.playing ? 'playing' : st}</span>
        </span>
        <span className="text-white/20">│</span>
        <span>engine: browser · ai {s.aiStatus}</span>
      </div>
      <div className="flex items-center gap-2">
        {items.map((t, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-white/15">│</span>}
            {t}
          </span>
        ))}
      </div>
    </footer>
  );
}
