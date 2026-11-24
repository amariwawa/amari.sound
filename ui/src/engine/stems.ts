/**
 * Client for the local stem server (stems-server/server.py — Meta's Demucs "htdemucs").
 * The server binds to 127.0.0.1 only; audio never leaves the machine.
 */
export const STEM_SERVER = 'http://127.0.0.1:8765';

export interface StemServerHealth {
  ok: boolean;
  model: string;
  device: string;
  loaded: boolean;
}

export async function stemHealth(timeoutMs = 1500): Promise<StemServerHealth | null> {
  try {
    const r = await fetch(`${STEM_SERVER}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok ? ((await r.json()) as StemServerHealth) : null;
  } catch {
    return null;
  }
}

/** Upload a 44.1 kHz 16-bit WAV, get back the separated stems as WAV bytes. */
export async function separate(wav: Uint8Array): Promise<{ seconds: number; stems: { name: string; data: ArrayBuffer }[] }> {
  const r = await fetch(`${STEM_SERVER}/separate`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav' },
    body: wav as Uint8Array<ArrayBuffer>,
  });
  if (!r.ok) throw new Error((await r.text()) || `server error ${r.status}`);
  const res = (await r.json()) as { id: string; stems: string[]; seconds: number };
  const stems = await Promise.all(
    res.stems.map(async (name) => {
      const f = await fetch(`${STEM_SERVER}/stems/${res.id}/${name}.wav`);
      if (!f.ok) throw new Error(`could not fetch ${name}`);
      return { name, data: await f.arrayBuffer() };
    }),
  );
  return { seconds: res.seconds, stems };
}
