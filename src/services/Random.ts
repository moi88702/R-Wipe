/**
 * Random — seeded pseudorandom number generation.
 *
 * Provides a Mulberry32 PRNG factory. All procedural generation that must be
 * reproducible across sessions (solar system layout, resource deposit
 * placement, etc.) should obtain its RNG from `seededRng` rather than
 * `Math.random`, so that a stored seed is sufficient to reconstruct any
 * derived state exactly.
 *
 * Usage:
 *   const rng = seededRng(42);
 *   const a = rng(); // → deterministic float in [0, 1)
 *   const b = rng(); // → next value in sequence
 *
 * Portability: no dependencies, runs identically in Node and the browser.
 */

/**
 * A deterministic pseudorandom function that returns floats in [0, 1).
 * Calling it repeatedly produces an independent, reproducible sequence.
 */
export type RngFn = () => number;

/**
 * Mulberry32 — a fast, high-quality 32-bit PRNG.
 *
 * Given the same `seed`, the returned function always produces the same
 * sequence of values. This is the canonical algorithm recommended in the
 * technical design for solar system generation.
 *
 * Algorithm reference:
 *   https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
 *
 * @param seed - Any 32-bit integer (truncated via `>>> 0` if needed).
 * @returns A zero-argument function that emits successive floats in [0, 1).
 */
export function seededRng(seed: number): RngFn {
  // Work on a local mutable copy so each call to seededRng() starts fresh.
  let s = seed >>> 0;
  return function (): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Convenience helper: return a random integer in [min, max] (inclusive at
 * both ends) using the supplied RNG.
 *
 * @param rng - A seeded (or any) RNG function.
 * @param min - Lower bound (inclusive).
 * @param max - Upper bound (inclusive).
 */
export function randomInt(rng: RngFn, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Convenience helper: return a random float in [min, max) using the supplied
 * RNG.
 *
 * @param rng - A seeded (or any) RNG function.
 * @param min - Lower bound (inclusive).
 * @param max - Upper bound (exclusive).
 */
export function randomFloat(rng: RngFn, min: number, max: number): number {
  return rng() * (max - min) + min;
}

/**
 * Pick a uniformly random element from a non-empty array.
 *
 * @param rng   - A seeded (or any) RNG function.
 * @param items - Array with at least one element.
 * @returns One element chosen at random.
 */
export function randomPick<T>(rng: RngFn, items: readonly T[]): T {
  const index = randomInt(rng, 0, items.length - 1);
  // The non-null assertion is safe: randomInt with min=0, max=items.length-1
  // always returns a valid index when items is non-empty.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return items[index]!;
}
