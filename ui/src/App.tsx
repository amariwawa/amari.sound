import { useEffect, useRef, useState } from 'react';
import { useAmari } from './state';
import { Header } from './components/Header';
import { RecordPanel } from './components/RecordPanel';
import { ExportPanel, SourcePanel } from './components/SidePanels';
import { Waveform } from './components/Waveform';
import { BpmCard, CompatibleKeys, KeyCard } from './components/Results';
import { StatusBar } from './components/StatusBar';
import { StemsPanel } from './components/StemsPanel';

export default function App() {
  const amari = useAmari();
  const { state: s, toggleRecord, togglePlay, loadFile } = amari;
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  // Space = record/stop · Enter = play/stop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        toggleRecord();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleRecord, togglePlay]);

  // Drop an audio file anywhere on the page
  useEffect(() => {
    const isFile = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const enter = (e: DragEvent) => {
      if (!isFile(e)) return;
      e.preventDefault();
      depth.current++;
      setDragging(true);
    };
    const over = (e: DragEvent) => isFile(e) && e.preventDefault();
    const leave = (e: DragEvent) => {
      if (!isFile(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!isFile(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) loadFile(f);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [loadFile]);

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 p-8">
      <div
        className="amari-dots relative flex h-[560px] w-[900px] select-none flex-col overflow-hidden rounded-[10px] border border-white/[0.09] bg-panel
                   shadow-[0_50px_120px_-30px_rgba(0,0,0,0.75),0_0_0_1px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)]"
      >
        <Header s={s} />
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[248px] shrink-0 flex-col gap-4 border-r border-white/[0.07] bg-ash-900/70 p-4">
            <RecordPanel s={s} onToggle={toggleRecord} />
            <SourcePanel s={s} actions={amari} />
            <div className="flex-1" />
            <ExportPanel s={s} actions={amari} />
          </aside>
          <main className="flex min-w-0 flex-1 flex-col gap-2.5 p-4">
            <div className="h-[112px] shrink-0">
              <Waveform s={s} actions={amari} />
            </div>
            {s.view === 'stems' ? (
              <div className="min-h-0 flex-1">
                <StemsPanel s={s} actions={amari} />
              </div>
            ) : (
              <>
                <div className="flex h-[176px] shrink-0 gap-2.5">
                  <BpmCard s={s} actions={amari} />
                  <KeyCard s={s} actions={amari} />
                </div>
                <CompatibleKeys s={s} actions={amari} />
              </>
            )}
          </main>
        </div>
        <StatusBar s={s} />
        <div className="amari-scan absolute inset-0" />

        {dragging && (
          <div className="absolute inset-2 z-50 grid place-items-center rounded-[8px] border-2 border-dashed border-white/70 bg-ash-950/85 backdrop-blur-sm">
            <div className="text-center">
              <div className="text-[22px] font-bold tracking-[-0.04em] text-white">drop to analyze</div>
              <div className="mt-1 text-[11px] text-white/50">bpm · key · scale · compatible keys</div>
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px] tracking-wide text-white/25">
        <span className="text-white/50">space</span> rec/stop · <span className="text-white/50">enter</span> play · drop a file anywhere
      </p>
    </div>
  );
}
