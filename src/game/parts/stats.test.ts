import { describe, expect, it } from "vitest";
import { computeShipStats, getBaseStats } from "./stats";
import type { Blueprint } from "../../types/shipBuilder";

const starter: Blueprint = {
  id: "bp-starter",
  name: "Starter",
  parts: [
    { id: "core", partId: "core-starter", parentId: null, parentSocketId: null, colourId: null },
    { id: "hull", partId: "hull-starter", parentId: "core", parentSocketId: "s-hull", colourId: null },
  ],
};

describe("computeShipStats", () => {
  it("returns base stats when blueprint has no parts", () => {
    const s = computeShipStats({ id: "empty", name: "Empty", parts: [] });
    const base = getBaseStats();
    expect(s.hp).toBe(base.hp);
    expect(s.speed).toBe(base.speed);
    // Hitbox is floored to 16×12 minimum so collisions stay sensible.
    expect(s.hitbox.width).toBeGreaterThanOrEqual(16);
    expect(s.hitbox.height).toBeGreaterThanOrEqual(12);
  });

  it("folds deltas from every placed part", () => {
    const heavy: Blueprint = {
      id: "bp-heavy",
      name: "Heavy",
      parts: [
        { id: "core", partId: "core-mid", parentId: null, parentSocketId: null, colourId: null },
        { id: "hull", partId: "hull-heavy", parentId: "core", parentSocketId: "s-hull", colourId: null },
        { id: "wL", partId: "wing-fin-l", parentId: "hull", parentSocketId: "s-top-l", colourId: null },
      ],
    };
    const s = computeShipStats(heavy);
    const base = getBaseStats();
    // HP: base + core-mid (+10) + hull-heavy (+25) + wing-fin-l (+5)
    expect(s.hp).toBe(base.hp + 10 + 25 + 5);
    // Speed: base + hull-heavy (-30)
    expect(s.speed).toBe(base.speed - 30);
    // Damage: base + core-mid (+2) + wing-fin-l (+1)
    expect(s.damage).toBe(base.damage + 2 + 1);
  });

  it("tracks power usage and capacity", () => {
    const s = computeShipStats(starter);
    // Starter core cap=1, hull costs 1.
    expect(s.powerCapacity).toBe(1);
    expect(s.powerUsed).toBe(1);
  });

  it("hitbox grows once a hull is attached", () => {
    const coreOnly = computeShipStats({
      id: "c", name: "C",
      parts: [
        { id: "core", partId: "core-starter", parentId: null, parentSocketId: null, colourId: null },
      ],
    });
    const withHull = computeShipStats(starter);
    expect(withHull.hitbox.width).toBeGreaterThan(coreOnly.hitbox.width);
  });

  it("never drops stats below safe floors", () => {
    const s = computeShipStats(starter);
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
        { id: "core", partId: "core-starter", parentId: null, parentSocketId: null, colourId: null },
        { id: "ghost", partId: "made-up-part", parentId: "core", parentSocketId: "s-hull", colourId: null },
      ],
    };
    const s = computeShipStats(bp);
    expect(s.hp).toBeGreaterThan(0);
  });
});
