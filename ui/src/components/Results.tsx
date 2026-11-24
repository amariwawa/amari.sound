import type { ReactNode } from 'react';
import type { Actions, UiState } from '../state';
import { currentBpm, detectedKey } from '../state';
import type { KeyChoice } from '../types';
import { camelot, keyName, pcName, relatedKeys, relativeKey, sameKey, scaleChords, scaleNotes, sharedNotes } from '../music';

const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`relative rounded-[6px] border border-white/[0.08] bg-ash-950/50 p-3.5 ${className}`}>{children}</div>
);
const Cap = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <div className="mb-2 flex items-baseline justify-between text-[9px] tracking-[0.1em] text-white/40">
    <span>
      <span className="text-white/20">// </span>
      {children}
    </span>
    {right}
  </div>
);
const Bar = ({ v }: { v: number }) => (
  <div className="h-[2px] w-full bg-white/10">
    <div className="h-full bg-white/70 transition-[width] duration-500" style={{ width: `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%` }} />
  </div>
);
const Skeleton = ({ h }: { h: number }) => <div className="amari-sweep rounded-[3px] bg-white/[0.04]" style={{ height: h }} />;

// ───────────────────────── BPM ─────────────────────────

export function BpmCard({ s, actions }: { s: UiState; actions: Actions }) {
  const t = s.analysis?.tempo;
  const bpm = currentBpm(s);
  const conf = t?.confidence ?? 0;
  const label = !t ? '' : conf > 0.6 ? 'steady beat' : conf > 0.3 ? 'loose beat' : 'no clear beat';
  const options = t ? [...t.alternatives.filter((a) => a < t.bpm), t.bpm, ...t.alternatives.filter((a) => a > t.bpm)] : [];
  const show = (b: number) => b;
  const chosen = s.bpmChoice ?? t?.bpm;
  return (
    <Card className="flex w-[200px] shrink-0 flex-col">
      <Cap right={t && <span className="text-white/50">{label}</span>}>tempo</Cap>
      {t && bpm ? (
        <>
          <div key={bpm} className="flex items-baseline gap-2 [animation:amari-rise_350ms_ease-out]">
            <span className="text-[52px] font-bold leading-none tracking-[-0.07em] tabular-nums text-white [text-shadow:0_0_22px_rgba(255,255,255,0.3)]">
              {bpm}
            </span>
            <span className="text-[11px] text-white/45">bpm</span>
          </div>
          <div className="mt-2.5">
            <Bar v={conf} />
          </div>
          <div className="mt-1.5 text-[9px] leading-snug text-white/40">
            {t.fromLoopLength ? `exact ${t.loopBars}-bar loop` : `beat ${t.beatOffset.toFixed(2)}s in`}
            {s.bpmChoice !== null && ' · your pick'}
            {s.fx.halftime && <span className="text-white"> · halftime feel</span>}
          </div>
          <div className="mt-auto grid gap-px overflow-hidden rounded-[4px] border border-white/10 bg-white/10" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
            {options.map((o) => {
              const on = o === chosen;
              const tag = o === t.bpm ? 'detected' : o < t.bpm ? 'half' : 'double';
              return (
                <button
                  key={o}
                  onClick={() => actions.chooseBpm(o === t.bpm ? null : o)}
                  className={`flex flex-col items-center py-1 text-[11px] leading-tight ${on ? 'bg-white font-bold text-black' : 'bg-ash-900 text-white/60 hover:text-white'}`}
                >
                  {show(o)}
                  <span className={`text-[8px] font-normal ${on ? 'text-black/60' : 'text-white/30'}`}>{tag}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col gap-2">
          {s.state === 'analyzing' ? <Skeleton h={52} /> : <div className="text-[52px] font-bold leading-none text-white/10">—</div>}
          <div className="mt-auto text-[9px] text-white/30">half / double time options appear here</div>
        </div>
      )}
    </Card>
  );
}

// ───────────────────────── Key ─────────────────────────

const WHITE = [0, 2, 4, 5, 7, 9, 11];
const BLACK: [number, number][] = [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]]; // pc, after white index

function Keyboard({ k }: { k: KeyChoice }) {
  const scale = new Set(scaleNotes(k));
  const W = 24, H = 58;
  const fill = (pc: number, white: boolean) => (pc === k.tonic ? '#fff' : scale.has(pc) ? (white ? '#c9cacf' : '#8d8e94') : white ? '#2a2b2f' : '#121315');
  return (
    <svg width={W * 7} height={H + 14} className="block">
      {[0].map((oct) => (
        <g key={oct} transform={`translate(${oct * W * 7},0)`}>
          {WHITE.map((pc, i) => (
            <g key={pc}>
              <rect x={i * W + 0.5} y={0.5} width={W - 1} height={H} rx={2} fill={fill(pc, true)} stroke="#000" strokeOpacity="0.5"
                style={pc === k.tonic ? { filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.6))' } : undefined} />
              {scale.has(pc) && (
                <text x={i * W + W / 2} y={H + 11} textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" fill="#fff" fillOpacity={pc === k.tonic ? 0.95 : 0.5} fontWeight={pc === k.tonic ? 700 : 400}>
                  {pcName(pc, k)}
                </text>
              )}
            </g>
          ))}
          {BLACK.map(([pc, after]) => (
            <rect key={pc} x={(after + 1) * W - 7} y={0.5} width={14} height={H * 0.6} rx={1.5} fill={fill(pc, false)} stroke="#000" strokeOpacity="0.6" />
          ))}
          {BLACK.filter(([pc]) => scale.has(pc) && oct === 0).map(([pc, after]) => (
            <text key={`t${pc}`} x={(after + 1) * W} y={H * 0.6 - 4} textAnchor="middle" fontSize="7" fontFamily="var(--font-mono)" fill={pc === k.tonic ? '#000' : '#fff'} fillOpacity="0.85">
              {pcName(pc, k)}
            </text>
          ))}
        </g>
      ))}
    </svg>
  );
}

export function KeyCard({ s, actions }: { s: UiState; actions: Actions }) {
  const a = s.analysis?.key;
  const det = detectedKey(s);
  const k = s.focusKey ?? det;
  const exploring = !!s.focusKey && !sameKey(s.focusKey, det);
  const strength = a ? Math.max(0, a.ranking[0].score) : 0;
  const label = !a ? '' : a.tonality < 0.25 ? 'mostly drums/noise' : strength > 0.8 ? 'strong' : strength > 0.6 ? 'likely' : 'weak';

  return (
    <Card className="flex min-w-0 flex-1 flex-col">
      <Cap
        right={
          exploring ? (
            <button onClick={() => actions.setFocusKey(null)} className="text-white hover:underline">
              ← back to detected
            </button>
          ) : (
            a && <span className="text-white/50">{label}</span>
          )
        }
      >
        {exploring ? 'exploring key' : 'key'}
      </Cap>
      {k && a ? (
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex min-w-0 flex-1 flex-col">
            <div key={keyName(k)} className="flex items-baseline gap-2 [animation:amari-rise_350ms_ease-out]">
              <span className="truncate text-[30px] font-bold leading-none tracking-[-0.05em] text-white [text-shadow:0_0_22px_rgba(255,255,255,0.3)]">
                {keyName(k).split(' ')[0]}
                <span className="ml-1.5 font-light text-white/55">{k.mode}</span>
              </span>
              <span className="rounded-[3px] bg-white px-1.5 py-px text-[11px] font-bold text-black">{camelot(k)}</span>
            </div>
            {!exploring && (
              <>
                <div className="mt-2.5">
                  <Bar v={strength} />
                </div>
                <div className="mt-1.5 text-[9px] leading-relaxed text-white/40">
                  {s.analysis?.aiPending ? (
                    <span className="text-white/70">refining with ai…</span>
                  ) : a.source === 'spectrum+ai' ? (
                    `spectrum + ai (${s.analysis?.aiNotes} notes)`
                  ) : (
                    'spectrum'
                  )}
                  {Math.abs(a.tuningCents) >= 10 && ` · tuned ${a.tuningCents > 0 ? '+' : ''}${a.tuningCents}c`}
                </div>
                {a.relativeAmbiguous && (
                  <button onClick={() => actions.setFocusKey(relativeKey(k))} className="mt-1 text-left text-[9px] text-white/55 hover:text-white">
                    or {keyName(relativeKey(k))} — same notes →
                  </button>
                )}
              </>
            )}
            <div className="mt-auto">
              <div className="mb-1 text-[8px] tracking-[0.1em] text-white/30">chords that fit</div>
              <div className="flex flex-wrap gap-1">
                {scaleChords(k).map((c) => (
                  <span key={c.numeral} title={c.numeral} className="rounded-[3px] border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/80">
                    {c.name}
                    <span className="ml-1 text-[8px] text-white/30">{c.numeral}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="shrink-0">
            <div className="mb-1 text-[8px] tracking-[0.1em] text-white/30">scale notes</div>
            <Keyboard k={k} />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2">
          {s.state === 'analyzing' ? <Skeleton h={30} /> : <div className="text-[30px] font-bold leading-none text-white/10">—</div>}
          <div className="mt-auto text-[9px] text-white/30">key, camelot code, scale and chords appear here</div>
        </div>
      )}
    </Card>
  );
}

// ───────────────────────── Compatible keys ─────────────────────────

export function CompatibleKeys({ s, actions }: { s: UiState; actions: Actions }) {
  const det = detectedKey(s);
  const a = s.analysis?.key;
  const score = (k: KeyChoice) => a?.ranking.find((r) => sameKey(r, k))?.score ?? 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[9px] tracking-[0.1em] text-white/40">
        <span>
          <span className="text-white/20">// </span>keys that mix with it{det ? ` · ${keyName(det)}` : ''}
        </span>
        {det && <span className="text-white/30">click a key to see its scale & chords</span>}
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {det
          ? relatedKeys(det).map((r) => {
              const on = sameKey(s.focusKey, r.key);
              const shared = sharedNotes(det, r.key);
              return (
                <button
                  key={r.label}
                  onClick={() => actions.setFocusKey(on ? null : r.key)}
                  title={`${keyName(r.key)} — ${r.hint}`}
                  className={`flex h-[96px] flex-col rounded-[5px] border p-2 text-left transition-colors ${
                    on ? 'border-white/80 bg-white/[0.1]' : 'border-white/[0.08] bg-ash-950/50 hover:border-white/30 hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="truncate text-[8px] tracking-[0.06em] text-white/40">{r.label}</span>
                  <span className="mt-1 truncate text-[14px] font-bold leading-tight tracking-[-0.03em] text-white">{keyName(r.key).replace(' major', ' maj').replace(' minor', ' min')}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[9px] text-white/50">
                    <span className="rounded-[2px] bg-white/15 px-1 text-white">{camelot(r.key)}</span>
                    {shared}/7 notes
                  </span>
                  <span className="mt-auto truncate text-[8px] text-white/35">{r.hint}</span>
                  <div className="mt-1 h-[2px] w-full bg-white/10" title="how well this key fits the sample">
                    <div className="h-full bg-white/60" style={{ width: `${Math.round(Math.max(0, score(r.key)) * 100)}%` }} />
                  </div>
                </button>
              );
            })
          : Array.from({ length: 6 }, (_, i) => (
              <div key={i} className={`h-[96px] rounded-[5px] border border-white/[0.05] bg-ash-950/30 ${s.state === 'analyzing' ? 'amari-sweep' : ''}`} />
            ))}
      </div>
    </div>
  );
}
