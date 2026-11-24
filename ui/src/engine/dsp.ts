/** Small DSP toolkit: radix-2 FFT and a streaming anti-aliased resampler. */

export class FFT {
  readonly n: number;
  private rev: Uint32Array;
  private cos: Float64Array;
  private sin: Float64Array;

  constructor(n: number) {
    if (n & (n - 1)) throw new Error('FFT size must be a power of two');
    this.n = n;
    const bits = Math.log2(n);
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let k = 0; k < n / 2; k++) {
      this.cos[k] = Math.cos((2 * Math.PI * k) / n);
      this.sin[k] = Math.sin((2 * Math.PI * k) / n);
    }
  }

  /** In-place forward transform (e^{-i2πkn/N}). */
  transform(re: Float64Array, im: Float64Array) {
    const { n, rev, cos, sin } = this;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j, b = a + half;
          const tr = re[b] * cos[k] + im[b] * sin[k];
          const ti = im[b] * cos[k] - re[b] * sin[k];
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }
}

/**
 * Streaming resampler: windowed-sinc low-pass (anti-alias) + linear interpolation.
 * Push input blocks at `inRate`, read everything produced so far at `outRate`.
 */
export class Resampler {
  private readonly ratio: number;
  private readonly h: Float32Array;
  private readonly half: number;
  private input = new Float32Array(1 << 16);
  private inLen = 0;
  private out = new Float32Array(1 << 15);
  private outLen = 0;
  private pos = 0;

  constructor(inRate: number, outRate: number, taps = 64) {
    this.ratio = inRate / outRate;
    this.half = taps >> 1;
    const fc = (0.45 * outRate) / inRate; // cutoff, cycles/sample
    const h = new Float32Array(taps);
    let sum = 0;
    for (let m = 0; m < taps; m++) {
      const x = m - (taps - 1) / 2;
      const sinc = x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
      const win = 0.42 - 0.5 * Math.cos((2 * Math.PI * m) / (taps - 1)) + 0.08 * Math.cos((4 * Math.PI * m) / (taps - 1));
      h[m] = sinc * win;
      sum += h[m];
    }
    for (let m = 0; m < taps; m++) h[m] /= sum;
    this.h = h;
  }

  push(block: Float32Array) {
    if (this.inLen + block.length > this.input.length) {
      const bigger = new Float32Array(Math.max(this.input.length * 2, this.inLen + block.length));
      bigger.set(this.input.subarray(0, this.inLen));
      this.input = bigger;
    }
    this.input.set(block, this.inLen);
    this.inLen += block.length;

    while (Math.floor(this.pos) + 1 + this.half < this.inLen) {
      const i = Math.floor(this.pos);
      const frac = this.pos - i;
      const a = this.filtered(i);
      const b = this.filtered(i + 1);
      if (this.outLen >= this.out.length) {
        const bigger = new Float32Array(this.out.length * 2);
        bigger.set(this.out);
        this.out = bigger;
      }
      this.out[this.outLen++] = a + (b - a) * frac;
      this.pos += this.ratio;
    }
  }

  private filtered(c: number) {
    const { h, input, half } = this;
    let acc = 0;
    const start = c - half + 1;
    for (let m = 0; m < h.length; m++) {
      const idx = start + m;
      if (idx >= 0) acc += h[m] * input[idx];
    }
    return acc;
  }

  /** All output produced so far (view, do not hold across pushes). */
  output() {
    return this.out.subarray(0, this.outLen);
  }
}
