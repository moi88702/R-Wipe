import { describe, it, expect } from "vitest";
import {
  PITY_EXTRA_LIFE_FULL_MS,
  PITY_EXTRA_LIFE_MAX_MULTIPLIER,
  PITY_EXTRA_LIFE_THRESHOLD_MS,
  PowerUpManager,
  SPAWN_WEIGHTS,
} from "./PowerUpManager";
import type { PowerUpType } from "../types/index";

/** Mulberry32 — tiny deterministic PRNG returning values in [0, 1). */
function makeSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("PowerUpManager.rollType — distribution", () => {
  it("produces counts within ±2% of declared weights over 10 000 rolls", () => {
    const mgr = new PowerUpManager(makeSeededRng(0xbada55));
    const counts: Record<string, number> = {};
    const N = 10_000;

    for (let i = 0; i < N; i++) {
      const type = mgr.rollType();
      counts[type] = (counts[type] ?? 0) + 1;
    }

    const totalWeight = SPAWN_WEIGHTS.reduce((s, e) => s + e.weight, 0);
    for (const entry of SPAWN_WEIGHTS) {
      const expected = (entry.weight / totalWeight) * N;
      const actual = counts[entry.type] ?? 0;
      const tolerance = N * 0.02;
      expect(
        Math.abs(actual - expected),
        `${entry.type}: expected ~${expected.toFixed(0)}, got ${actual}`,
      ).toBeLessThanOrEqual(tolerance);
    }
  });

  it("every declared type appears at least once over 10 000 rolls", () => {
    const mgr = new PowerUpManager(makeSeededRng(123));
    const seen = new Set<PowerUpType>();
    for (let i = 0; i < 10_000; i++) seen.add(mgr.rollType());
    for (const entry of SPAWN_WEIGHTS) expect(seen.has(entry.type)).toBe(true);
  });
});

describe("PowerUpManager.rollType — pity for extra-life", () => {
  it("below the threshold, extra-life rate matches its declared weight (±2%)", () => {
    const mgr = new PowerUpManager(makeSeededRng(7));
    const N = 10_000;
    let extras = 0;
    for (let i = 0; i < N; i++) if (mgr.rollType() === "extra-life") extras++;

    const totalWeight = SPAWN_WEIGHTS.reduce((s, e) => s + e.weight, 0);
    const elWeight = SPAWN_WEIGHTS.find((e) => e.type === "extra-life")!.weight;
    const expected = (elWeight / totalWeight) * N;
    expect(Math.abs(extras - expected)).toBeLessThanOrEqual(N * 0.02);
  });

  it("at full pity, extra-life rate is boosted close to the declared multiplier", () => {
    const mgr = new PowerUpManager(makeSeededRng(42));
    // Push the internal clock past full pity. update() advances the counter.
    mgr.update(PITY_EXTRA_LIFE_THRESHOLD_MS + PITY_EXTRA_LIFE_FULL_MS + 1_000);

    const N = 10_000;
    let extras = 0;
    for (let i = 0; i < N; i++) if (mgr.rollType() === "extra-life") extras++;

    // With the extra-life weight multiplied by max, its share of the normalised
    // table is (elWeight*max) / (totalWeight - elWeight + elWeight*max).
    const totalWeight = SPAWN_WEIGHTS.reduce((s, e) => s + e.weight, 0);
    const elWeight = SPAWN_WEIGHTS.find((e) => e.type === "extra-life")!.weight;
    const boosted = elWeight * PITY_EXTRA_LIFE_MAX_MULTIPLIER;
    const newTotal = totalWeight - elWeight + boosted;
    const expected = (boosted / newTotal) * N;
    expect(Math.abs(extras - expected)).toBeLessThanOrEqual(N * 0.02);
  });

  it("spawnPowerUp('extra-life') resets the pity timer", () => {
    const mgr = new PowerUpManager(makeSeededRng(1));
    mgr.update(PITY_EXTRA_LIFE_THRESHOLD_MS + PITY_EXTRA_LIFE_FULL_MS);
    // Boosted probability — ~24% over many rolls with max pity.
    const boosted = SPAWN_WEIGHTS.find((e) => e.type === "extra-life")!.weight * PITY_EXTRA_LIFE_MAX_MULTIPLIER;
    const totalAfterBoost =
      SPAWN_WEIGHTS.reduce((s, e) => s + e.weight, 0) -
      SPAWN_WEIGHTS.find((e) => e.type === "extra-life")!.weight +
      boosted;
    const boostedShare = boosted / totalAfterBoost;

    // Now directly spawn an extra-life — this should reset the timer.
    mgr.spawnPowerUp("extra-life", 100, 100);

    // After reset, extra-life rate should be back to baseline.
    let extras = 0;
    const N = 10_000;
    for (let i = 0; i < N; i++) if (mgr.rollType() === "extra-life") extras++;
    const baselineShare =
      SPAWN_WEIGHTS.find((e) => e.type === "extra-life")!.weight /
      SPAWN_WEIGHTS.reduce((s, e) => s + e.weight, 0);

    const actualShare = extras / N;
    // Actual should be close to baseline, clearly below the boosted rate.
    expect(actualShare).toBeLessThan((baselineShare + boostedShare) / 2);
    expect(Math.abs(actualShare - baselineShare)).toBeLessThanOrEqual(0.02);
  });

  it("initialize() resets the pity timer", () => {
    const mgr = new PowerUpManager(makeSeededRng(9));
    mgr.update(PITY_EXTRA_LIFE_THRESHOLD_MS + PITY_EXTRA_LIFE_FULL_MS);
    mgr.initialize();

    const N = 10_000;
    let extras = 0;
    for (let i = 0; i < N; i++) if (mgr.rollType() === "extra-life") extras++;

    const baselineShare =
      SPAWN_WEIGHTS.find((e) => e.type === "extra-life")!.weight /
      SPAWN_WEIGHTS.reduce((s, e) => s + e.weight, 0);
    expect(Math.abs(extras / N - baselineShare)).toBeLessThanOrEqual(0.02);
  });
});
