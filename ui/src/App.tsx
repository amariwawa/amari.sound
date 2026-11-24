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

  // Space / Enter = play/stop (like every DAW) · R = record/stop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        toggleRecord();
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
    <div className="flex min-h-full flex-col items-center justify-center gap-5 md:p-8">
      <div
        className="amari-dots relative flex min-h-[100dvh] w-full select-none flex-col overflow-hidden bg-panel md:h-[560px] md:min-h-0 md:w-[900px] md:rounded-[10px] md:border md:border-white/[0.09]
                   shadow-[0_50px_120px_-30px_rgba(0,0,0,0.75),0_0_0_1px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)]"
      >
        <Header s={s} />
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="flex w-full shrink-0 flex-col gap-4 border-b border-white/[0.07] bg-ash-900/70 p-4 md:w-[248px] md:border-b-0 md:border-r">
            <RecordPanel s={s} onToggle={toggleRecord} />
            <SourcePanel s={s} actions={amari} />
            <div className="hidden flex-1 md:block" />
            <div className="hidden md:block">
              <ExportPanel s={s} actions={amari} />
            </div>
          </aside>
          <main className="flex min-w-0 flex-1 flex-col gap-2.5 p-4">
            <div className="shrink-0 md:h-[112px]">
              <Waveform s={s} actions={amari} />
            </div>
            {s.view === 'stems' ? (
              <div className="min-h-[300px] flex-1 md:min-h-0">
                <StemsPanel s={s} actions={amari} />
              </div>
            ) : (
              <>
                <div className="flex shrink-0 flex-col gap-2.5 md:h-[176px] md:flex-row">
                  <BpmCard s={s} actions={amari} />
                  <KeyCard s={s} actions={amari} />
                </div>
                <CompatibleKeys s={s} actions={amari} />
              </>
            )}
            {/* on phones the export controls come after the results */}
            <div className="border-t border-white/[0.07] pt-4 md:hidden">
              <ExportPanel s={s} actions={amari} />
            </div>
          </main>
        </div>
        <StatusBar s={s} actions={amari} />
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

      <p className="hidden text-[11px] tracking-wide text-white/25 md:block">
        <span className="text-white/50">space</span> play/stop · <span className="text-white/50">R</span> record · drop a file anywhere
      </p>
    </div>
  );
}
