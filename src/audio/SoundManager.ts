/**
 * SoundManager — all game audio, procedurally synthesised via Web Audio API.
 * No audio files required. Call init() lazily on first user gesture.
 *
 * Throttling: most one-shot sounds have a minimum gap to prevent audio spam.
 * Continuous sounds (thruster) use a dedicated oscillator node.
 */

export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;

  // Continuous thruster oscillator
  private thrusterOsc: OscillatorNode | null = null;
  private thrusterGain: GainNode | null = null;
  private thrusterActive = false;
  private thrusterActiveMs = 0;
  private static readonly THRUSTER_PEAK_GAIN = 0.12;
  private static readonly THRUSTER_FADE_START_MS = 2500;
  private static readonly THRUSTER_FADE_DURATION_MS = 3000;

  // Per-sound throttle timestamps (ms)
  private readonly lastPlayed = new Map<string, number>();
  private readonly throttleMs: Record<string, number> = {
    arcadeShoot: 80,
    enemyHit: 60,
    enemyDefeatedSmall: 80,
    enemyDefeatedBoss: 200,
    playerHit: 150,
    playerDeath: 500,
    powerUp: 200,
    panicBomb: 400,
    levelClear: 1000,
    menuNav: 80,
    menuConfirm: 150,
    solarShoot: 100,
    solarHit: 150,
    docking: 500,
    undocking: 500,
    gateJump: 800,
  };

  // ── Public lifecycle ────────────────────────────────────────────────────────

  /** Must be called from a user-gesture handler before any sounds play. */
  init(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.6;
      this.masterGain.connect(this.ctx.destination);
    } catch {
      // AudioContext unsupported — all play() calls will no-op.
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.6, this.ctx!.currentTime, 0.05);
    }
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  // ── One-shot game sounds ───────────────────────────────────────────────────

  arcadeShoot(): void {
    if (!this.throttle("arcadeShoot")) return;
    this.playTone(880, "square", 0.08, 0, 0.04, { freqEnd: 440, filterFreq: 2000 });
  }

  enemyHit(): void {
    if (!this.throttle("enemyHit")) return;
    this.playNoise(0.12, 0, 0.06, 3000, 1);
  }

  enemyDefeatedSmall(): void {
    if (!this.throttle("enemyDefeatedSmall")) return;
    this.playExplosion(0.2, 0.12, 1200);
  }

  enemyDefeatedBoss(): void {
    if (!this.throttle("enemyDefeatedBoss")) return;
    this.playExplosion(0.6, 0.5, 300);
  }

  playerHit(): void {
    if (!this.throttle("playerHit")) return;
    // Low heavy thud
    this.playTone(120, "sawtooth", 0.35, 0, 0.18, { freqEnd: 60, filterFreq: 600 });
    this.playNoise(0.25, 0.02, 0.12, 800, 1);
  }

  playerDeath(): void {
    if (!this.throttle("playerDeath")) return;
    this.playExplosion(0.8, 0.8, 120);
    // Descending sweep
    this.playTone(440, "sawtooth", 0.3, 0.1, 0.6, { freqEnd: 55, filterFreq: 2000 });
  }

  powerUp(): void {
    if (!this.throttle("powerUp")) return;
    // Rising arpeggio feel — three quick ascending tones
    this.playTone(523, "sine", 0.25, 0, 0.1);
    this.playTone(659, "sine", 0.2, 0.07, 0.1);
    this.playTone(784, "sine", 0.18, 0.14, 0.12);
  }

  panicBomb(): void {
    if (!this.throttle("panicBomb")) return;
    this.playExplosion(0.7, 0.6, 200);
    // Wide sweep down
    this.playTone(600, "square", 0.3, 0, 0.4, { freqEnd: 80, filterFreq: 3000 });
  }

  levelClear(): void {
    if (!this.throttle("levelClear")) return;
    // Victory fanfare: C-E-G-C
    const notes = [261, 329, 392, 523];
    notes.forEach((f, i) => {
      this.playTone(f, "triangle", 0.3, i * 0.12, 0.15);
    });
  }

  menuNav(): void {
    if (!this.throttle("menuNav")) return;
    this.playTone(440, "sine", 0.12, 0, 0.06);
  }

  menuConfirm(): void {
    if (!this.throttle("menuConfirm")) return;
    this.playTone(660, "sine", 0.2, 0, 0.08);
    this.playTone(880, "sine", 0.15, 0.06, 0.08);
  }

  solarShoot(): void {
    if (!this.throttle("solarShoot")) return;
    this.playTone(1200, "sawtooth", 0.1, 0, 0.08, { freqEnd: 600, filterFreq: 4000 });
  }

  solarHit(): void {
    if (!this.throttle("solarHit")) return;
    this.playNoise(0.2, 0, 0.1, 2000, 1);
    this.playTone(200, "sawtooth", 0.2, 0, 0.12, { freqEnd: 100 });
  }

  docking(): void {
    if (!this.throttle("docking")) return;
    // Soft ascending confirm tone
    this.playTone(330, "sine", 0.2, 0, 0.15);
    this.playTone(440, "sine", 0.2, 0.12, 0.15);
    this.playTone(550, "sine", 0.25, 0.24, 0.2);
  }

  undocking(): void {
    if (!this.throttle("undocking")) return;
    // Descending departure tone
    this.playTone(550, "sine", 0.2, 0, 0.12);
    this.playTone(440, "sine", 0.2, 0.1, 0.12);
    this.playTone(330, "sine", 0.15, 0.2, 0.15);
  }

  gateJump(): void {
    if (!this.throttle("gateJump")) return;
    // Sci-fi jump: rising sweep + noise burst
    this.playTone(200, "sawtooth", 0.3, 0, 0.4, { freqEnd: 1800, filterFreq: 5000 });
    this.playNoise(0.4, 0.1, 0.3, 8000, 2);
  }

  // ── Continuous thruster sound ──────────────────────────────────────────────

  setThrusterActive(active: boolean): void {
    if (active === this.thrusterActive) return;
    this.thrusterActive = active;
    if (active) {
      this.thrusterActiveMs = 0;
    }
    if (!this.ctx || !this.masterGain) return;
    if (active) {
      this.startThruster();
    } else {
      this.stopThruster();
    }
  }

  tickThruster(deltaMs: number): void {
    if (!this.thrusterActive || !this.thrusterGain || !this.ctx) return;
    this.thrusterActiveMs += deltaMs;
    const fadeStart = SoundManager.THRUSTER_FADE_START_MS;
    const fadeDur = SoundManager.THRUSTER_FADE_DURATION_MS;
    const peak = SoundManager.THRUSTER_PEAK_GAIN;
    if (this.thrusterActiveMs <= fadeStart) return;
    const t = Math.min(1, (this.thrusterActiveMs - fadeStart) / fadeDur);
    const target = peak * (1 - t);
    this.thrusterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
  }

  private startThruster(): void {
    if (!this.ctx || !this.masterGain) return;
    if (this.thrusterOsc) return; // already running

    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(SoundManager.THRUSTER_PEAK_GAIN, ctx.currentTime + 0.1);

    // Low rumble oscillator
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 60;
    osc.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.2);

    // Band-pass filter for a jet-engine texture
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 120;
    filter.Q.value = 0.8;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start();

    this.thrusterOsc = osc;
    this.thrusterGain = gain;
  }

  private stopThruster(): void {
    if (!this.ctx || !this.thrusterGain || !this.thrusterOsc) return;
    const ctx = this.ctx;
    const currentVal = this.thrusterGain.gain.value;
    this.thrusterGain.gain.cancelScheduledValues(ctx.currentTime);
    this.thrusterGain.gain.setValueAtTime(currentVal, ctx.currentTime);
    this.thrusterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.0);
    const osc = this.thrusterOsc;
    setTimeout(() => {
      try { osc.stop(); } catch { /* already stopped */ }
    }, 2200);
    this.thrusterOsc = null;
    this.thrusterGain = null;
  }

  // ── Private synthesis helpers ──────────────────────────────────────────────

  private throttle(key: string): boolean {
    if (!this.ctx) return false;
    const now = performance.now();
    const gap = this.throttleMs[key] ?? 0;
    if ((this.lastPlayed.get(key) ?? 0) + gap > now) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  private playTone(
    freq: number,
    type: OscillatorType,
    peakGain: number,
    delayS: number,
    durationS: number,
    opts?: { freqEnd?: number; filterFreq?: number },
  ): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delayS;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (opts?.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), t + durationS);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peakGain, t + durationS * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durationS);

    if (opts?.filterFreq !== undefined) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = opts.filterFreq;
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + durationS + 0.01);
  }

  private playNoise(
    peakGain: number,
    delayS: number,
    durationS: number,
    filterFreq: number,
    filterQ: number,
  ): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delayS;

    const bufferSize = Math.ceil(ctx.sampleRate * durationS) || 1;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = filterFreq;
    filter.Q.value = filterQ;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peakGain, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durationS);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(t);
  }

  private playExplosion(peakGain: number, durationS: number, filterFreq: number): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // White noise burst
    const bufferSize = Math.ceil(ctx.sampleRate * durationS);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterFreq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(1, filterFreq * 0.05), t + durationS);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peakGain, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durationS);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(t);
  }
}

/** Singleton exported for the entire game. */
export const soundManager = new SoundManager();
