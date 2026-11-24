import type { Actions, UiState } from '../state';
import { currentBpm, detectedKey } from '../state';
import { camelot, keyName } from '../music';

export function StatusBar({ s, actions }: { s: UiState; actions: Actions }) {
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
    <footer className="relative z-10 flex min-h-6 shrink-0 items-center justify-between border-t py-1 border-white/[0.07] bg-ash-950/80 px-4 text-[10px] text-white/35">
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
        <label className="flex items-center gap-1.5" title="Where playback goes">
          <span>out</span>
          {s.outputs.supported && s.outputs.devices.length > 0 ? (
            <select
              value={s.outputs.current}
              onChange={(e) => actions.setOutput(e.target.value)}
              className="max-w-[170px] cursor-pointer truncate rounded-[2px] border border-white/15 bg-ash-900 px-1 text-[10px] text-white/80 outline-none hover:border-white/40"
            >
              {s.outputs.devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-white/60">system default</span>
          )}
        </label>
      </div>
      <div className="hidden items-center gap-2 md:flex">
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
