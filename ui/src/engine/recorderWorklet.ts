/**
 * AudioWorklet that captures mono input in ~21 ms batches, tagged with the
 * context frame of their first sample so they can be aligned with the click track.
 * Loaded from a Blob URL so it needs no extra bundler config.
 */
const SOURCE = `
class AmariRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 1024;
    this.buf = new Float32Array(this.size);
    this.len = 0;
    this.startFrame = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    if (this.len === 0) this.startFrame = currentFrame;
    this.buf.set(ch, this.len);
    this.len += ch.length;
    if (this.len >= this.size) {
      let sum = 0, peak = 0;
      for (let i = 0; i < this.len; i++) {
        const v = this.buf[i];
        sum += v * v;
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
      }
      const data = this.buf.slice(0, this.len);
      this.port.postMessage({ frame: this.startFrame, data, rms: Math.sqrt(sum / this.len), peak }, [data.buffer]);
      this.len = 0;
    }
    return true;
  }
}
registerProcessor('amari-recorder', AmariRecorder);
`;

export interface RecorderChunk {
  frame: number;
  data: Float32Array;
  rms: number;
  peak: number;
}

let url: string | null = null;
export function recorderWorkletUrl() {
  url ??= URL.createObjectURL(new Blob([SOURCE], { type: 'application/javascript' }));
  return url;
}
