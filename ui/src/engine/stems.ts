/**
 * Client for the stem API (stems-server/main.py — Meta's Demucs "htdemucs" on ONNX Runtime).
 *
 * Same-origin `/api` everywhere: on Vercel it is the "stems" service, locally Vite proxies it to
 * the uvicorn server on 127.0.0.1:8765. Override with VITE_STEM_API.
 *
 * Audio is sent in 5 s chunks with 1 s of context on each side (the model sees ≤ 7.8 s), so every
 * request stays far below serverless body limits and time limits. Chunks are stitched back with a
 * short crossfade.
 */
export const STEM_API: string = import.meta.env.VITE_STEM_API || '/api';

const SR = 44100;
const CORE = 5 * SR;
const CTX = 1 * SR;
const XF = Math.round(0.02 * SR); // crossfade between chunks
const PARALLEL = 2;

export interface StemServerHealth {
  ok: boolean;
  model: string;
  engine: string;
}

export async function stemHealth(timeoutMs = 4000): Promise<StemServerHealth | null> {
  try {
    const r = await fetch(`${STEM_API}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    const j = (await r.json()) as StemServerHealth;
    return j.ok ? j : null;
  } catch {
    return null;
  }
}

interface Chunk {
  /** core region in the source (frames) */
  start: number;
  end: number;
  ctxL: number;
  ctxR: number;
}

function plan(n: number): Chunk[] {
  const out: Chunk[] = [];
  for (let s = 0; s < n; s += CORE) {
    const start = s;
    // extend each core by XF so neighbours overlap for the crossfade
    const end = Math.min(n, s + CORE + (s + CORE < n ? XF : 0));
    out.push({ start, end, ctxL: Math.min(CTX, start), ctxR: Math.min(CTX, n - end) });
  }
  return out;
}

async function request(left: Float32Array, right: Float32Array, c: Chunk, attempt = 0): Promise<{ names: string[]; data: Int16Array }> {
  const a = c.start - c.ctxL, b = c.end + c.ctxR;
  const pcm = new Int16Array((b - a) * 2);
  for (let i = a, k = 0; i < b; i++) {
    pcm[k++] = Math.max(-32768, Math.min(32767, Math.round(left[i] * 32767)));
    pcm[k++] = Math.max(-32768, Math.min(32767, Math.round(right[i] * 32767)));
  }
  try {
    const r = await fetch(`${STEM_API}/stems?ctx_l=${c.ctxL}&ctx_r=${c.ctxR}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: pcm.buffer as ArrayBuffer,
    });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
    const names = (r.headers.get('X-Stems') ?? 'drums,bass,other,vocals').split(',');
    return { names, data: new Int16Array(await r.arrayBuffer()) };
  } catch (e) {
    if (attempt < 2) return request(left, right, c, attempt + 1); // cold start / transient error
    throw e;
  }
}

/**
 * Split stereo 44.1 kHz audio into stems.
 * @returns per stem: [left, right] Float32Arrays of the input length
 */
export async function separate(
  left: Float32Array,
  right: Float32Array,
  onProgress?: (done: number, total: number) => void,
): Promise<{ seconds: number; stems: Map<string, [Float32Array, Float32Array]> }> {
  const t0 = performance.now();
  const n = left.length;
  const chunks = plan(n);
  const stems = new Map<string, [Float32Array, Float32Array]>();
  let done = 0;
  onProgress?.(0, chunks.length);

  const place = (c: Chunk, names: string[], data: Int16Array) => {
    const frames = c.end - c.start;
    names.forEach((name, si) => {
      if (!stems.has(name)) stems.set(name, [new Float32Array(n), new Float32Array(n)]);
      const [L, R] = stems.get(name)!;
      const base = si * frames * 2;
      for (let i = 0; i < frames; i++) {
        const p = c.start + i;
        const l = data[base + 2 * i] / 32767, r = data[base + 2 * i + 1] / 32767;
        if (c.start > 0 && i < XF) {
          // fade in over the previous chunk's tail (equal power)
          const g = Math.sin(((i + 0.5) / XF) * (Math.PI / 2));
          const h = Math.cos(((i + 0.5) / XF) * (Math.PI / 2));
          L[p] = L[p] * h + l * g;
          R[p] = R[p] * h + r * g;
        } else {
          L[p] = l;
          R[p] = r;
        }
      }
    });
  };

  // run chunks with limited parallelism, but place them in order so crossfades see the previous tail
  const results: Promise<{ names: string[]; data: Int16Array }>[] = [];
  let next = 0;
  const launch = () => {
    if (next < chunks.length) {
      const i = next++;
      results[i] = request(left, right, chunks[i]).then((r) => {
        done++;
        onProgress?.(done, chunks.length);
        launch();
        return r;
      });
    }
  };
  for (let k = 0; k < PARALLEL; k++) launch();
  for (let i = 0; i < chunks.length; i++) {
    while (!results[i]) await new Promise((r) => setTimeout(r, 20));
    const r = await results[i];
    place(chunks[i], r.names, r.data);
  }
  return { seconds: (performance.now() - t0) / 1000, stems };
}
