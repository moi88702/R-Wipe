/**
 * Tests for src/services/Random.ts
 *
 * Focus: the observable contract of seededRng — determinism and statistical
 * sanity. No mocks needed; these are pure functions exercised with real data.
 */

import { describe, expect, it } from "vitest";
import { seededRng, randomInt, randomFloat, randomPick } from "./Random";

// ---------------------------------------------------------------------------
// seededRng — core determinism guarantees
// ---------------------------------------------------------------------------

describe("seededRng", () => {
  it("given the same seed, produces the same first value", () => {
    // Given two RNG instances seeded identically
    const rngA = seededRng(42);
    const rngB = seededRng(42);

    // When each emits its first value
    const a = rngA();
    const b = rngB();

    // Then they match exactly
    expect(a).toBe(b);
  });

  it("given the same seed, produces the same full sequence across multiple calls", () => {
    // Given two RNG instances seeded identically
    const rngA = seededRng(1234);
    const rngB = seededRng(1234);

    // When each emits 20 successive values
    const sequenceA = Array.from({ length: 20 }, () => rngA());
    const sequenceB = Array.from({ length: 20 }, () => rngB());

    // Then every value matches position-for-position
    expect(sequenceA).toEqual(sequenceB);
  });

  it("given different seeds, produces different first values", () => {
    // Given RNG instances with different seeds
    const rng1 = seededRng(1);
    const rng2 = seededRng(2);

    // When they each emit their first value
    const v1 = rng1();
    const v2 = rng2();

    // Then the values differ (Mulberry32 is well-distributed; collisions at
    // consecutive seeds are astronomically unlikely)
    expect(v1).not.toBe(v2);
  });

  it("returns values strictly in [0, 1)", () => {
    // Given a seeded RNG
    const rng = seededRng(99_999);

    // When 1000 values are drawn
    const values = Array.from({ length: 1000 }, () => rng());

    // Then every value is in the valid half-open range
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("each call to seededRng with the same seed restarts the sequence from the beginning", () => {
    // Given a seed
    const seed = 777;

    // When we create two separate RNG functions from the same seed
    const first5_A = Array.from({ length: 5 }, () => seededRng(seed)());

    // Then each fresh seededRng call starts over — they all return the same value
    // (the first element of the sequence)
    const first5_B = Array.from({ length: 5 }, () => seededRng(seed)());
    expect(first5_A).toEqual(first5_B);
  });

  it("produces different sequences for seed 0 and seed 1", () => {
    // Boundary: seed 0 is a valid input
    const rng0 = seededRng(0);
    const rng1 = seededRng(1);

    const seq0 = Array.from({ length: 5 }, () => rng0());
    const seq1 = Array.from({ length: 5 }, () => rng1());

    expect(seq0).not.toEqual(seq1);
  });

  it("produces stable known values for seed 42 (regression guard)", () => {
    // Given the canonical Mulberry32 implementation
    const rng = seededRng(42);

    // When the first three values are drawn
    const v1 = rng();
    const v2 = rng();
    const v3 = rng();

    // Then they match hardcoded expected outputs (these values are the ground
    // truth; if the algorithm changes, this test will catch the regression)
    expect(v1).toMatchSnapshot();
    expect(v2).toMatchSnapshot();
    expect(v3).toMatchSnapshot();
  });

  it("accepts a large seed without throwing", () => {
    // Given a seed larger than 32 bits (truncated via >>> 0 internally)
    expect(() => seededRng(Number.MAX_SAFE_INTEGER)).not.toThrow();
    const rng = seededRng(Number.MAX_SAFE_INTEGER);
    expect(() => rng()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// randomInt
// ---------------------------------------------------------------------------

describe("randomInt", () => {
  it("given the same seed-backed RNG, returns the same integer each time", () => {
    // Given two identically seeded RNGs
    const rngA = seededRng(7);
    const rngB = seededRng(7);

    // When randomInt is called with the same bounds
    const a = randomInt(rngA, 1, 10);
    const b = randomInt(rngB, 1, 10);

    // Then outputs are equal
    expect(a).toBe(b);
  });

  it("always returns integers within [min, max] inclusive", () => {
    // Given a seeded RNG and a range
    const rng = seededRng(2024);

    // When 500 integers are drawn from [3, 8]
    const values = Array.from({ length: 500 }, () => randomInt(rng, 3, 8));

    // Then all values are integers within bounds
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(8);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("can return min when min === max", () => {
    // Given a range of exactly one value
    const rng = seededRng(1);

    // When randomInt is called 10 times
    const values = Array.from({ length: 10 }, () => randomInt(rng, 5, 5));

    // Then every result is 5
    expect(values.every((v) => v === 5)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// randomFloat
// ---------------------------------------------------------------------------

describe("randomFloat", () => {
  it("given the same seed-backed RNG, returns the same float each time", () => {
    // Given two identically seeded RNGs
    const rngA = seededRng(13);
    const rngB = seededRng(13);

    // When randomFloat is called with the same bounds
    const a = randomFloat(rngA, 0.5, 1.5);
    const b = randomFloat(rngB, 0.5, 1.5);

    // Then outputs are equal
    expect(a).toBe(b);
  });

  it("always returns floats within [min, max)", () => {
    // Given a seeded RNG and a range
    const rng = seededRng(555);

    // When 500 floats are drawn from [10.0, 20.0)
    const values = Array.from({ length: 500 }, () => randomFloat(rng, 10.0, 20.0));

    // Then all values are within bounds
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(10.0);
      expect(v).toBeLessThan(20.0);
    }
  });
});

// ---------------------------------------------------------------------------
// randomPick
// ---------------------------------------------------------------------------

describe("randomPick", () => {
  it("given the same seed-backed RNG, picks the same element each time", () => {
    // Given two identically seeded RNGs and a shared array
    const rngA = seededRng(17);
    const rngB = seededRng(17);
    const items = ["alpha", "beta", "gamma", "delta"] as const;

    // When randomPick is called once on each
    const a = randomPick(rngA, items);
    const b = randomPick(rngB, items);

    // Then they select the same element
    expect(a).toBe(b);
  });

  it("always returns an element that exists in the array", () => {
    // Given a seeded RNG and a small array
    const rng = seededRng(300);
    const items = [10, 20, 30, 40, 50];

    // When 100 picks are made
    const picks = Array.from({ length: 100 }, () => randomPick(rng, items));

    // Then every pick is a member of the array
    for (const pick of picks) {
      expect(items).toContain(pick);
    }
  });

  it("returns the only element when array has length 1", () => {
    // Given an array with exactly one element
    const rng = seededRng(1);
    const result = randomPick(rng, ["solo"]);

    // Then it always returns that element
    expect(result).toBe("solo");
  });
});
