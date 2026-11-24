import { useRef, useState } from 'react';
import type { Actions, UiState } from '../state';
import { exportName, infoText } from '../state';
import { Label } from './ui';

const ACCEPT = 'audio/*,.wav,.mp3,.aif,.aiff,.flac,.m4a,.ogg';
const fmtDur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${s.toFixed(2)}s`);

export function SourcePanel({ s, actions }: { s: UiState; actions: Actions }) {
  const input = useRef<HTMLInputElement>(null);
  const busy = s.state !== 'idle';
  return (
    <div>
      <Label>sample</Label>
      <button
        disabled={busy}
        onClick={() => input.current?.click()}
        className="group flex h-[76px] w-full flex-col md:h-[92px] items-center justify-center gap-1.5 rounded-[6px] border border-dashed border-white/20 bg-ash-900/50
                   text-center transition-colors hover:border-white/50 hover:bg-white/[0.04] disabled:cursor-wait disabled:opacity-50"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" className="text-white/60 transition-transform group-hover:-translate-y-0.5">
          <path d="M10 13V3m0 0L6 7m4-4 4 4M3 13v3h14v-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[11px] font-semibold text-white/80"><span className="hidden md:inline">drop audio anywhere</span><span className="md:hidden">tap to choose a sample</span></span>
        <span className="text-[9px] text-white/35"><span className="hidden md:inline">or click to browse · </span>wav mp3 aiff flac m4a</span>
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) actions.loadFile(f);
          e.target.value = '';
        }}
      />
      {s.sample && (
        <div className="mt-2 rounded-[4px] border border-white/[0.07] bg-ash-900/40 px-2.5 py-2 text-[10px] leading-relaxed">
          <div className="truncate font-semibold text-white" title={s.sample.name}>
            {s.sample.source === 'mic' ? '● ' : ''}
            {s.sample.name}
          </div>
          <div className="text-white/40">
            {fmtDur(s.sample.duration)} · {s.sample.channels === 1 ? 'mono' : 'stereo'} · {(s.sample.sampleRate / 1000).toFixed(1)}k
          </div>
        </div>
      )}
    </div>
  );
}

export function ExportPanel({ s, actions }: { s: UiState; actions: Actions }) {
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const ready = !!s.sample && !!s.analysis && s.state === 'idle';
  const name = exportName(s);
  const stemsOpen = s.view === 'stems';
  return (
    <div>
      <button
        disabled={!s.sample}
        onClick={() => actions.setView(stemsOpen ? 'analysis' : 'stems')}
        title="Split into vocals / drums / bass / melody"
        className={`mb-3 flex h-9 w-full items-center gap-2 rounded-[4px] border px-3 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
          stemsOpen ? 'border-white bg-white/10 text-white' : 'border-white/20 text-white hover:border-white/50 hover:bg-white/[0.05]'
        }`}
      >
        <span className="text-[14px] leading-none">⑂</span>
        {stemsOpen ? 'back to analysis' : 'stem splitter'}
        <span className="ml-auto text-[9px] font-normal text-white/40">{s.stems.status === 'done' && s.stems.sampleId === s.sample?.id ? '4 stems ready' : 'ai'}</span>
      </button>
      <Label>export</Label>
      <div className="mb-2 truncate rounded-[3px] bg-black/20 px-2 py-1 text-[9px] text-white/45" title={name}>
        {ready ? name : '—'}
      </div>
      <div className="flex gap-2">
        <button
          draggable={ready}
          disabled={!ready}
          onDragStart={(e) => actions.exportSample(e.dataTransfer)}
          onClick={() => actions.exportSample()}
          title="Drag into your DAW or Finder (click to download) — renamed with key + BPM"
          className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[4px] bg-white px-3 text-black transition-all
                     enabled:cursor-grab enabled:hover:shadow-[0_0_24px_rgba(255,255,255,0.35)] active:cursor-grabbing
                     disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-white/25"
        >
          <svg width="8" height="14" viewBox="0 0 8 14">
            {[1.5, 6.5].map((x) => [2, 7, 12].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.3" fill="currentColor" />))}
          </svg>
          <span className="whitespace-nowrap text-[13px] font-bold tracking-[-0.02em]">drag sample</span>
          <span className="ml-auto text-[9px] opacity-50">.wav</span>
        </button>
        <button
          disabled={!ready}
          onClick={async () => {
            setCopied((await actions.copyInfo()) ? 'ok' : 'fail');
            setTimeout(() => setCopied('idle'), 1400);
          }}
          title={ready ? `Copy "${infoText(s)}"` : 'Copy key + BPM'}
          className={`flex h-10 w-[64px] flex-col items-center justify-center rounded-[4px] border text-[11px] leading-tight transition-colors
            disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:text-white/25
            ${copied === 'ok' ? 'border-white bg-white/10 text-white' : 'border-white/20 text-white hover:border-white/50 hover:bg-white/[0.05]'}`}
        >
          <span className="font-semibold">{copied === 'ok' ? 'copied' : copied === 'fail' ? 'blocked' : 'copy'}</span>
          <span className="text-[9px] text-white/40">{copied === 'ok' ? '✓' : 'key+bpm'}</span>
        </button>
      </div>
    </div>
  );
}
