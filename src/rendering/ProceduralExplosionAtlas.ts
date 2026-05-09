/**
 * ProceduralExplosionAtlas
 *
 * Generates explosion + smoke animated sprite frames using three layered
 * algorithms, all deterministic from a seed:
 *
 *  1. FIRE   — domain-warped fBm noise radius field → fire colour ramp
 *              (white-hot core → yellow → orange → red → ember)
 *  2. SMOKE  — separate noise warp at lower frequency → grey colour ramp
 *              (warm brown → cool grey → transparent)
 *  3. SPARKS — discrete particle traces fly outward then fade
 *
 * Each layer evolves independently over normalised time t ∈ [0, 1]:
 *   fire    rapid expand → shrink/fade   (peaks at t ≈ 0.2)
 *   smoke   slower expand → dissipate    (peaks at t ≈ 0.55)
 *   sparks  fly outward → extinguish     (each has its own lifetime)
 *
 * Usage:
 *   const atlas = generateExplosionAtlas({ seed: 42 });
 *   const sprite = new AnimatedSprite(atlas.textures as Texture[]);
 *   sprite.loop = false;
 *   sprite.animationSpeed = 0.4;
 *   sprite.anchor.set(0.5);
 *   sprite.onComplete = () => sprite.destroy();
 *   sprite.play();
 */

import { Texture, ImageSource } from "pixi.js";

// ── Public types ──────────────────────────────────────────────────────────────

export interface ExplosionAtlasConfig {
  /** Seed for deterministic generation. Different seeds → different shapes. */
  seed: number;
  /** Pixel size of each frame (square). Default: 128. */
  frameSize?: number;
  /** Number of animation frames. Default: 20. */
  frameCount?: number;
  /**
   * How far the explosion fills the frame.  1.0 = fills ~85% of width.
   * Use < 1 for small/distant blasts, > 1 to bleed off the edges.
   * Default: 1.0.
   */
  fillScale?: number;
  /**
   * 0 = pure fireball, 1 = maximum smoke.  Controls how long the smoke
   * phase lasts relative to the fire phase.  Default: 0.55.
   */
  smokeAmount?: number;
  /** Number of bright spark / debris particles.  Default: 14. */
  sparkCount?: number;
}

export interface ExplosionAtlas {
  readonly textures: readonly Texture[];
  readonly frameSize: number;
  readonly frameCount: number;
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function generateExplosionAtlas(cfg: ExplosionAtlasConfig): ExplosionAtlas {
  const frameSize  = cfg.frameSize  ?? 128;
  const frameCount = cfg.frameCount ?? 20;
  const fillScale  = cfg.fillScale  ?? 1.0;
  const smokeAmt   = cfg.smokeAmount ?? 0.55;
  const sparkCount = cfg.sparkCount  ?? 14;

  // Two independent noise grids give fire and smoke uncorrelated shapes.
  const noiseA = new ValueNoise(cfg.seed,              256);
  const noiseB = new ValueNoise(cfg.seed ^ 0xABCD1234, 256);

  const sparks = buildSparks(cfg.seed, sparkCount);

  const textures: Texture[] = [];
  for (let f = 0; f < frameCount; f++) {
    const t = f / Math.max(1, frameCount - 1); // 0 → 1
    textures.push(renderFrame(frameSize, t, fillScale, smokeAmt, noiseA, noiseB, sparks));
  }

  return { textures, frameSize, frameCount };
}

// ── Frame rendering ───────────────────────────────────────────────────────────

function renderFrame(
  size: number,
  t: number,
  fill: number,
  smokeAmt: number,
  noiseA: ValueNoise,
  noiseB: ValueNoise,
  sparks: SparkDef[],
): Texture {
  const canvas = document.createElement("canvas");
  canvas.width  = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const d   = img.data;

  const cx   = size / 2;
  const cy   = size / 2;
  // half is in "normalised-space units" that match the noise input scale
  const half = (size / 2) * fill;

  // ── Time-varying envelope parameters ─────────────────────────────────────
  //
  // Fire expands quickly with a power curve (fast burst, slow tail).
  // Smoke expands more slowly and grows larger.

  const fireExpand   = Math.pow(t, 0.45) * 0.88 + 0.08;
  const smokeExpand  = Math.pow(t, 0.55) * 1.20 + 0.15;

  // Fire is bright and short-lived; smoke builds then lingers.
  const fireOpacity  = Math.max(0, 1 - t * (1.0 + smokeAmt));
  const smokeOpacity =
    Math.min(1, t * 2.2) *
    Math.max(0, 1 - (t - 0.25) * (1.1 + smokeAmt * 0.5));

  // Phase offset shifts noise over time — gives the illusion of turbulent motion.
  const phaseA = t * 0.9;  // fire turbulence moves faster
  const phaseB = t * 0.45; // smoke drifts slower

  // ── Per-pixel loop ────────────────────────────────────────────────────────
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // Normalised position relative to centre.
      const nx = (px - cx) / half;
      const ny = (py - cy) / half;

      // ── Fire layer (domain-warped circle) ─────────────────────────────
      //
      // Domain warping: warp the input coordinates with a noise field before
      // evaluating the radial distance.  This breaks the perfect circle into
      // irregular, flame-like protrusions.  Using fBm (4 octaves) gives the
      // characteristic fine-detail turbulence of real fire.
      const fw = noiseA.octaves(nx * 2.8 + phaseA * 1.1, ny * 2.8 + phaseA * 0.7, 4) * 0.38;
      const fr = Math.hypot(nx + fw * 0.6, ny + fw * 0.5) + Math.abs(fw) * 0.25;
      const fireDensity = clamp01(1 - fr / fireExpand);
      const fireVal     = Math.pow(fireDensity, 1.3) * fireOpacity;

      // ── Smoke layer (lower-frequency warp, asymmetric) ────────────────
      //
      // Two separate warp axes give the smoke an asymmetric billowing shape —
      // matching how real smoke columns tilt and spread differently in x/y.
      const sw1 = noiseB.octaves(nx * 1.9 + phaseB * 0.6, ny * 1.9 + phaseB * 0.4, 3) * 0.50;
      const sw2 = noiseA.octaves(nx * 1.9 + 33 + phaseB * 0.5, ny * 1.9 - 17 + phaseB * 0.7, 3) * 0.50;
      const sdr = Math.hypot(nx + sw1 * 0.7, ny + sw2 * 0.6) + (Math.abs(sw1) + Math.abs(sw2)) * 0.18;
      const smokeDensity = clamp01(1 - sdr / smokeExpand);
      const smokeVal     = Math.pow(smokeDensity, 0.75) * smokeOpacity * (0.25 + smokeDensity * 0.75);

      // ── Compositing ───────────────────────────────────────────────────
      const i = (py * size + px) * 4;

      if (fireVal > 0.015) {
        const fp = firePixel(fireVal, t);
        d[i] = fp[0]; d[i+1] = fp[1]; d[i+2] = fp[2]; d[i+3] = fp[3];
      }

      if (smokeVal > 0.015) {
        const sp2 = smokePixel(smokeVal, t);
        const curA = d[i+3] ?? 0;
        if (curA > 0) {
          // Standard alpha-over compositing: smoke on top of fire.
          const fa  = curA / 255;
          const sa2 = sp2[3] / 255;
          const out = fa + sa2 * (1 - fa);
          if (out > 0) {
            d[i]   = Math.round(((d[i]   ?? 0) * fa + sp2[0] * sa2 * (1 - fa)) / out);
            d[i+1] = Math.round(((d[i+1] ?? 0) * fa + sp2[1] * sa2 * (1 - fa)) / out);
            d[i+2] = Math.round(((d[i+2] ?? 0) * fa + sp2[2] * sa2 * (1 - fa)) / out);
            d[i+3] = Math.round(out * 255);
          }
        } else {
          d[i] = sp2[0]; d[i+1] = sp2[1]; d[i+2] = sp2[2]; d[i+3] = sp2[3];
        }
      }
    }
  }

  // ── Spark pass (discrete particles over pixel buffer) ────────────────────
  for (const sp of sparks) {
    if (t < 0.02 || t > sp.life) continue;
    const st  = t / sp.life;               // 0→1 within spark lifetime
    const rad = st * sp.speed * half * 1.3;
    const spx = Math.round(cx + Math.cos(sp.angle) * rad);
    const spy = Math.round(cy + Math.sin(sp.angle) * rad);
    if (spx < 0 || spx >= size || spy < 0 || spy >= size) continue;
    // Alpha envelope: fade in quickly, fade out slowly
    const sa  = clamp01((1 - st) * Math.min(1, st * 6));
    const si  = (spy * size + spx) * 4;
    d[si]   = 255;
    d[si+1] = Math.round(210 * (1 - st * 0.7));
    d[si+2] = Math.round(90  * (1 - st));
    d[si+3] = Math.round(sa * 255);
  }

  ctx.putImageData(img, 0, 0);

  // Pixi v8: create texture via ImageSource so we control the resource type.
  const source = new ImageSource({ resource: canvas });
  return new Texture({ source });
}

// ── Colour ramps ──────────────────────────────────────────────────────────────

/**
 * Fire colour ramp (density + normalised age → RGBA).
 *
 * The "age" parameter cools the effective density over time — older fire
 * looks more red/orange and less white, matching the physics of cooling gas.
 *
 *   density 1.0 → white-hot core
 *   density 0.6 → bright yellow
 *   density 0.4 → orange
 *   density 0.2 → deep red
 *   density 0.0 → dim ember / transparent
 */
function firePixel(density: number, age: number): RGBA {
  const v = clamp01(density - age * 0.35); // cool with age
  let r: number, g: number, b: number;

  if (v > 0.72) {
    const s = (v - 0.72) / 0.28;
    r = 255; g = Math.round(200 + 55 * s); b = Math.round(s * 200);
  } else if (v > 0.48) {
    const s = (v - 0.48) / 0.24;
    r = 255; g = Math.round(80 + 120 * s); b = 0;
  } else if (v > 0.22) {
    const s = (v - 0.22) / 0.26;
    r = Math.round(180 + 75 * s); g = Math.round(s * 80); b = 0;
  } else {
    const s = v / 0.22;
    r = Math.round(55 + 125 * s); g = 0; b = 0;
  }

  return [r, g, b, Math.round(clamp(density * 290, 0, 255))];
}

/**
 * Smoke colour ramp (density + age → RGBA).
 *
 * Early smoke (low age) has a warm brown tinge from the fire underneath.
 * As it ages the brown fades to neutral grey.  Alpha peaks mid-animation
 * then slowly dissipates.
 */
function smokePixel(density: number, age: number): RGBA {
  const warmth = clamp01(1 - age * 2.5);
  const base = Math.round(35 + density * 90);
  const r = clamp(Math.round(base + warmth * 45), 0, 255);
  const g = clamp(Math.round(base - 5 + warmth * 18), 0, 255);
  const b = clamp(Math.round(base - 18), 0, 255);
  const alpha = clamp(
    Math.pow(density, 0.5) * 210
    * Math.min(1, age * 3.0)
    * Math.max(0, 1 - (age - 0.35) * 1.7),
    0, 255,
  );
  return [r, g, b, Math.round(alpha)];
}

// ── Spark definitions ─────────────────────────────────────────────────────────

interface SparkDef {
  angle: number;   // radians
  speed: number;   // normalised units / unit time
  life:  number;   // fraction of total animation (0–1)
}

function buildSparks(seed: number, count: number): SparkDef[] {
  const rng = makeRng(seed ^ 0x9F2EC3);
  return Array.from({ length: count }, () => ({
    angle: rng() * Math.PI * 2,
    speed: 0.45 + rng() * 0.80,
    life:  0.22 + rng() * 0.42,
  }));
}

// ── Value noise ───────────────────────────────────────────────────────────────

/**
 * Seeded 2D value noise with smooth (Hermite) interpolation.
 *
 * This is the classical lattice-value noise algorithm: fill a grid with
 * pseudo-random scalar values, then smoothly interpolate between neighbours
 * using the Hermite curve 3t²-2t³ (Ken Perlin's "fade" function) to avoid
 * the blocky appearance of bilinear interpolation.
 *
 * fBm (fractional Brownian Motion) is produced by summing multiple octaves
 * at increasing frequency / decreasing amplitude, giving the characteristic
 * "self-similar at all scales" appearance of natural phenomena.
 */
class ValueNoise {
  private readonly g: Float32Array;
  private readonly mask: number;

  constructor(seed: number, size = 256) {
    this.mask = size - 1;
    this.g    = new Float32Array(size * size);
    let s = seed >>> 0;
    for (let i = 0; i < size * size; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      this.g[i] = (s / 0x100000000) * 2 - 1;
    }
  }

  sample(x: number, y: number): number {
    const m  = this.mask;
    const s  = m + 1;
    const xi = Math.floor(x) & m;
    const yi = Math.floor(y) & m;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    // Hermite smoothstep
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = this.g[yi         * s + xi]!;
    const b = this.g[yi         * s + ((xi + 1) & m)]!;
    const c = this.g[((yi+1)&m) * s + xi]!;
    const dd= this.g[((yi+1)&m) * s + ((xi + 1) & m)]!;
    return a + u * (b - a) + v * (c - a + u * (a - b - c + dd));
  }

  /**
   * Fractional Brownian Motion: sum of `octs` noise octaves.
   * Each successive octave doubles frequency (lacunarity) and halves
   * amplitude (gain), building up fine detail over a coarse structure.
   */
  octaves(x: number, y: number, octs: number, lac = 2.0, gain = 0.5): number {
    let val = 0, amp = 1, freq = 1, mx = 0;
    for (let i = 0; i < octs; i++) {
      val  += this.sample(x * freq, y * freq) * amp;
      mx   += amp;
      amp  *= gain;
      freq *= lac;
    }
    return val / mx;
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

type RGBA = [number, number, number, number];

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s >>> 0) / 0x100000000;
  };
}
