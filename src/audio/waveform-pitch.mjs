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
    this.minHop = Math.round(rate * 0.042);
    this.overlap = Math.round(rate * 0.022);
    this.deferStep = Math.round(rate * 0.004);
    this.triggerLag = Math.round(rate * 0.009);
    this.maxDeferLag = Math.round(rate * 0.016);
    this.minJump = Math.round(rate * 0.004);
    this.maxJump = Math.round(rate * 0.025);
    this.maxLead = Math.round(rate * 0.015);
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
        Math.log2(latency + this.minHop + this.overlap + this.maxJump + 512),
      );
    this.mask = length - 1;
    this.history = [new Float32Array(length), new Float32Array(length)];
    this.attacks = new Uint8Array(length);
    this.transients = new Uint8Array(length);
    this.fast = 0;
    this.slow = 0;
    this.lastLeft = 0;
    this.lastRight = 0;
    this.lowLeft = 0;
    this.lowRight = 0;
    this.bandLeft = 0;
    this.bandRight = 0;
    this.prevLeft = 0;
    this.prevRight = 0;
    this.hpFast = 0;
    this.hpSlow = 0;
    this.lowRate = 1 - Math.exp((-2 * Math.PI * 180) / rate);
    this.nextAttack = 0;
    this.fastRate = 1 - Math.exp(-1 / (rate * 0.002));
    this.slowRate = 1 - Math.exp(-1 / (rate * 0.05));
    this.attackGap = Math.round(rate * 0.06);
    this.fade = Float32Array.from(
      { length: this.overlap },
      (_, i) => 0.5 - 0.5 * Math.cos((Math.PI * i) / (this.overlap - 1)),
    );
    this.fadeLength = this.overlap;
    this.frame = 0;
    this.phase = this.minHop;
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
    // Search strictly ahead of the current head to avoid lag-0 self-match stalls.
    const low = reference + this.minJump;
    const high = Math.min(reference + this.maxJump, target + this.maxLead);
    if (low >= high) return target + (this.head - reference);
    const bias = (0.15 * this.score(reference, reference, span)) / (high - low);
    let best = Math.min(high, Math.max(low, target)),
      bestScore =
        this.score(best, reference, span) - bias * Math.abs(best - target);
    for (let c = low; c <= high; c += this.stride) {
      const next = this.score(c, reference, span) - bias * Math.abs(c - target);
      if (next > bestScore) {
        best = c;
        bestScore = next;
      }
    }
    const coarse = best;
    for (
      let c = Math.max(low, coarse - this.stride + 1);
      c <= Math.min(high, coarse + this.stride - 1);
      ++c
    ) {
      const next = this.score(c, reference, span) - bias * Math.abs(c - target);
      if (next > bestScore) {
        best = c;
        bestScore = next;
      }
    }
    return best + (this.head - reference);
  }

  hasTransient(start, end) {
    const begin = Math.floor(start),
      finish = Math.ceil(end);
    for (let p = begin; p <= finish; p += this.stride) {
      if (p >= 0 && this.transients[p & this.mask]) return true;
    }
    return false;
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
      const currentLeft = this.history[0][index],
        currentRight = this.history[1][index];
      this.lowLeft += this.lowRate * (currentLeft - this.lowLeft);
      this.lowRight += this.lowRate * (currentRight - this.lowRight);
      this.bandLeft += this.lowRate * (this.lowLeft - this.bandLeft);
      this.bandRight += this.lowRate * (this.lowRight - this.bandRight);
      const power =
        ((this.bandLeft - this.lastLeft) ** 2 +
          (this.bandRight - this.lastRight) ** 2) /
        2;
      this.lastLeft = this.bandLeft;
      this.lastRight = this.bandRight;
      this.fast += this.fastRate * (power - this.fast);
      this.slow += this.slowRate * (power - this.slow);
      const attack =
        this.frame >= this.nextAttack &&
        this.fast > 0.0000001 &&
        this.fast > 5 * this.slow;
      this.attacks[index] = attack ? 1 : 0;
      if (attack) this.nextAttack = this.frame + this.attackGap;
      const dl = currentLeft - this.prevLeft,
        dr = currentRight - this.prevRight;
      this.prevLeft = currentLeft;
      this.prevRight = currentRight;
      const hpPower = (dl * dl + dr * dr) / 2;
      this.hpFast += this.fastRate * (hpPower - this.hpFast);
      this.hpSlow += this.slowRate * (hpPower - this.hpSlow);
      this.transients[index] =
        this.hpFast > 0.0000001 && this.hpFast > 9 * this.hpSlow ? 1 : 0;
      if (ratio) {
        const target = this.frame - this.latency;
        const attackPos = target + this.overlap;
        if (attackPos >= 0 && this.attacks[attackPos & this.mask]) {
          // Finish the splice at the detected attack's original time without flamming.
          const desired = target + (1 - ratio) * this.overlap;
          if (Math.abs(desired - this.head) >= 1) {
            this.previous = this.head;
            if (this.head > desired) {
              const safe = Math.floor((attackPos - this.head) / ratio);
              this.fadeLength = Math.max(2, Math.min(this.overlap, safe));
            } else {
              this.fadeLength = this.overlap;
            }
            this.head = desired;
            this.phase = 0;
          }
        } else if (this.phase >= this.minHop) {
          const lag = target - this.head;
          if (lag >= this.triggerLag) {
            const lookahead = Math.min(
              this.overlap,
              Math.max(0, this.latency - this.overlap),
            );
            let upcoming = false;
            for (let offset = 1; offset < lookahead; ++offset) {
              if (
                attackPos + offset >= 0 &&
                this.attacks[(attackPos + offset) & this.mask]
              ) {
                upcoming = true;
                break;
              }
            }
            if (upcoming) {
              // Defer regular hop splice so the upcoming attack starts a clean crossfade.
              this.phase = this.minHop - this.deferStep;
            } else {
              const candidate = this.align(target, ratio);
              const span = this.overlap * ratio;
              if (
                lag < this.maxDeferLag &&
                this.hasTransient(
                  this.head + 0.32 * span,
                  candidate + 0.68 * span,
                )
              ) {
                this.phase = this.minHop - this.deferStep;
              } else {
                this.previous = this.head;
                this.fadeLength = this.overlap;
                this.head = candidate;
                this.phase = 0;
              }
            }
          }
        }
        const fade =
          this.phase < this.fadeLength
            ? this.fadeLength === this.overlap
              ? this.fade[this.phase]
              : this.fade[
                  Math.round(
                    (this.phase * (this.overlap - 1)) / (this.fadeLength - 1),
                  )
                ]
            : undefined;
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
        if (this.phase < this.minHop) this.phase++;
      } else {
        this.head = this.frame + 1 - this.latency;
        this.fadeLength = this.overlap;
        this.phase = this.minHop;
      }
      this.frame++;
    }
  }
}
