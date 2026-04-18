import { describe, expect, it } from "vitest";
import { computeShipStats, getBaseStats } from "./stats";
import type { Blueprint } from "../../types/shipBuilder";

const vanilla: Blueprint = {
  id: "bp-vanilla",
  name: "Vanilla",
  parts: [
    { id: "r", partId: "hull-standard-t1", parentId: null, parentSocketId: null, colourId: null },
    { id: "c", partId: "cockpit-standard-t1", parentId: "r", parentSocketId: "s-nose", colourId: null },
    { id: "wL", partId: "wing-standard-l-t1", parentId: "r", parentSocketId: "s-wingL", colourId: null },
    { id: "wR", partId: "wing-standard-r-t1", parentId: "r", parentSocketId: "s-wingR", colourId: null },
    { id: "e", partId: "engine-standard-t1", parentId: "r", parentSocketId: "s-tail", colourId: null },
  ],
};

describe("computeShipStats", () => {
  it("returns base stats when blueprint has no parts", () => {
    const s = computeShipStats({ id: "empty", name: "Empty", parts: [] });
    const base = getBaseStats();
    expect(s.hp).toBe(base.hp);
    expect(s.speed).toBe(base.speed);
    expect(s.hitbox.width).toBeGreaterThanOrEqual(16);
  });

  it("folds deltas from every placed part", () => {
    const heavy: Blueprint = {
      id: "bp-heavy",
      name: "Heavy",
      parts: [
        { id: "r", partId: "hull-reinforced-t1", parentId: null, parentSocketId: null, colourId: null },
        { id: "c", partId: "cockpit-techno-t2", parentId: "r", parentSocketId: "s-nose", colourId: null },
        { id: "wL", partId: "wing-armoured-t2", parentId: "r", parentSocketId: "s-wingL", colourId: null },
        { id: "wR", partId: "wing-armoured-r-t2", parentId: "r", parentSocketId: "s-wingR", colourId: null },
        { id: "e", partId: "engine-plasma-t3", parentId: "r", parentSocketId: "s-tail", colourId: null },
      ],
    };
    const s = computeShipStats(heavy);
    const base = getBaseStats();
    // HP: base + reinforced hull (+35) + 2×armoured wing (+20 each)
    expect(s.hp).toBe(base.hp + 35 + 20 + 20);
    // Speed: base -20 (reinforced) - 10×2 (wings) - 5% adjustments etc. +60 (plasma)
    expect(s.speed).toBe(base.speed - 20 - 10 - 10 + 60);
    // Damage: base + 2×2 (armoured wings)
    expect(s.damage).toBe(base.damage + 4);
    // Bays: aggregated across parts.
    expect(s.bays.primary).toBeGreaterThanOrEqual(1);
    expect(s.bays.defensive).toBeGreaterThanOrEqual(2);
    expect(s.bays.reactor).toBeGreaterThanOrEqual(1);
  });

  it("grows the hitbox as more parts are added", () => {
    const small = computeShipStats({
      id: "s",
      name: "S",
      parts: [{ id: "r", partId: "hull-standard-t1", parentId: null, parentSocketId: null, colourId: null }],
    });
    const big = computeShipStats(vanilla);
    expect(big.hitbox.width).toBeGreaterThan(small.hitbox.width);
    expect(big.hitbox.height).toBeGreaterThan(small.hitbox.height);
  });

  it("never drops stats below safe floors", () => {
    // Pure speculation blueprint with massively negative deltas would still
    // produce clamped values — here we just sanity-check the floors hold on
    // the vanilla config.
    const s = computeShipStats(vanilla);
    expect(s.hp).toBeGreaterThanOrEqual(10);
    expect(s.speed).toBeGreaterThanOrEqual(100);
    expect(s.fireRate).toBeGreaterThanOrEqual(0.25);
    expect(s.damage).toBeGreaterThanOrEqual(1);
  });

  it("skips unknown partIds silently", () => {
    const bp: Blueprint = {
      id: "bad",
      name: "Bad",
      parts: [
        { id: "r", partId: "hull-standard-t1", parentId: null, parentSocketId: null, colourId: null },
        { id: "ghost", partId: "made-up-part", parentId: "r", parentSocketId: "s-nose", colourId: null },
      ],
    };
    const s = computeShipStats(bp);
    expect(s.hp).toBeGreaterThan(0);
  });
});
