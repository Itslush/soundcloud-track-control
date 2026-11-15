export class WaveformPitch {
  static interpolationTable() {
    const taps = 32,
      phases = 256;
    const table = new Float32Array((phases + 1) * taps);
    for (let phase = 0; phase <= phases; phase++) {
      const start = phase * taps;
      let sum = 0;
      for (let tap = 0; tap < taps; tap++) {
        const angle = Math.PI * (tap - 15 - phase / phases);
        const window =
          0.42 + 0.5 * Math.cos(angle / 16) + 0.08 * Math.cos(angle / 8);
        const value = (angle === 0 ? 1 : Math.sin(angle) / angle) * window;
        table[start + tap] = value;
        sum += value;
      }
      for (let tap = 0; tap < taps; tap++) table[start + tap] /= sum;
    }
    return table;
  }

  constructor(rate, latency) {
    this.kernel = this.constructor.kernel ??=
      this.constructor.interpolationTable();
    this.latency = latency;
    this.hop = Math.round(rate * 0.074);
    this.overlap = Math.round(rate * 0.022);
    this.search = Math.round(rate * 0.026);
    this.stride = Math.max(1, Math.round(rate / 6000));
    // Stagger the correlation samples so a steady harmonic cannot fall between them.
    const step = this.stride * 2;
    this.offsets = Uint32Array.from(
      { length: Math.ceil(this.overlap / step) },
      (_, k) => k * step + (k % step),
    );
    const length =
      2 **
      Math.ceil(
        Math.log2(latency + this.hop + this.overlap + this.search + 256),
      );
    this.mask = length - 1;
    this.history = [new Float32Array(length), new Float32Array(length)];
    this.fade = Float32Array.from(
      { length: this.overlap },
      (_, i) => 0.5 - 0.5 * Math.cos((Math.PI * i) / (this.overlap - 1)),
    );
    this.frame = 0;
    this.phase = 0;
    this.head = -latency;
    this.previous = this.head;
  }

  // Compare both channels at the same lag so stereo phase survives each splice.
  score(start, reference, span) {
    const [left, right] = this.history;
    let dot = 0,
      power = 0;
    for (let k = 0; k < this.offsets.length && this.offsets[k] < span; ++k) {
      const i = this.offsets[k];
      const a = (reference + i) & this.mask,
        b = (start + i) & this.mask;
      const l = left[b],
        r = right[b];
      dot += left[a] * l + right[a] * r;
      power += l * l + r * r;
    }
    return dot / Math.sqrt(power + 1e-18);
  }

  align(target, ratio) {
    const reference = Math.round(this.head);
    const span = Math.round(this.overlap * ratio);
    // Prefer the nearest matching bass cycle to keep drum attacks on the beat.
    const timeBias =
      (0.01 * this.score(reference, reference, span)) / this.search;
    let best = target,
      score = this.score(target, reference, span);
    for (let delta = -this.search; delta <= this.search; delta += this.stride) {
      const next =
        this.score(target + delta, reference, span) -
        timeBias * Math.abs(delta);
      if (next > score) {
        best = target + delta;
        score = next;
      }
    }
    const coarse = best;
    for (
      let i = Math.max(coarse - this.stride + 1, target - this.search);
      i <= Math.min(coarse + this.stride - 1, target + this.search);
      ++i
    ) {
      const next =
        this.score(i, reference, span) - timeBias * Math.abs(i - target);
      if (next > score) {
        best = i;
        score = next;
      }
    }
    return best + (this.head - reference);
  }

  sample(channel, position) {
    const frame = Math.floor(position);
    const row = Math.round((position - frame) * 256) * 32;
    const samples = this.history[channel];
    let value = 0;
    for (let tap = 0; tap < 32; tap++)
      value += this.kernel[row + tap] * samples[(frame - 15 + tap) & this.mask];
    return value;
  }

  process(input, output, ratio) {
    const n = output[0].length,
      left = input?.[0],
      right = input?.[1] ?? left;
    for (let i = 0; i < n; ++i) {
      const index = this.frame & this.mask;
      this.history[0][index] = left?.[i] ?? 0;
      this.history[1][index] = right?.[i] ?? 0;
      if (ratio) {
        if (this.phase === 0) {
          this.previous = this.head;
          this.head = this.align(this.frame - this.latency, ratio);
        }
        const fade = this.fade[this.phase];
        for (let c = 0; c < output.length; ++c) {
          const next = this.sample(c, this.head);
          const value =
            fade === undefined
              ? next
              : next * fade + this.sample(c, this.previous) * (1 - fade);
          output[c][i] = value;
        }
        this.head += ratio;
        this.previous += ratio;
        if (++this.phase === this.hop) this.phase = 0;
      } else {
        this.head = this.frame + 1 - this.latency;
        this.phase = 0;
      }
      this.frame++;
    }
  }
}
