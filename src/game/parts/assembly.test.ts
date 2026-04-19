import { describe, expect, it } from "vitest";
import { canSnap, validateBlueprint } from "./assembly";
import type { Blueprint } from "../../types/shipBuilder";

const valid: Blueprint = {
  id: "bp-valid",
  name: "Valid",
  parts: [
    { id: "core", partId: "core-mid", parentId: null, parentSocketId: null, colourId: null },
    { id: "hull", partId: "hull-starter", parentId: "core", parentSocketId: "s-hull", colourId: null },
    { id: "wL", partId: "wing-fin-l", parentId: "hull", parentSocketId: "s-top", colourId: null },
    { id: "wR", partId: "wing-fin-r", parentId: "hull", parentSocketId: "s-bot", colourId: null },
  ],
};

describe("validateBlueprint", () => {
  it("accepts a well-formed blueprint", () => {
    const r = validateBlueprint(valid);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("rejects a blueprint with no root", () => {
    const bp: Blueprint = { id: "x", name: "x", parts: [] };
    const r = validateBlueprint(bp);
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.kind).toBe("no-root");
  });

  it("rejects a non-core root", () => {
    const bp: Blueprint = {
      id: "x", name: "x",
      parts: [
        { id: "r", partId: "hull-starter", parentId: null, parentSocketId: null, colourId: null },
      ],
    };
    const r = validateBlueprint(bp);
    expect(r.errors.some((e) => e.kind === "root-not-core")).toBe(true);
  });

  it("flags duplicate socket usage", () => {
    const bp: Blueprint = {
      id: "x", name: "x",
      parts: [
        { id: "core", partId: "core-mid", parentId: null, parentSocketId: null, colourId: null },
        { id: "h1", partId: "hull-starter", parentId: "core", parentSocketId: "s-hull", colourId: null },
        { id: "h2", partId: "hull-starter", parentId: "core", parentSocketId: "s-hull", colourId: null },
      ],
    };
    const r = validateBlueprint(bp);
    expect(r.errors.some((e) => e.kind === "duplicate-socket-use")).toBe(true);
  });

  it("flags unreachable parts (detached cluster)", () => {
    const bp: Blueprint = {
      id: "x", name: "x",
      parts: [
        { id: "core", partId: "core-starter", parentId: null, parentSocketId: null, colourId: null },
        { id: "hull", partId: "hull-starter", parentId: "core", parentSocketId: "s-hull", colourId: null },
        { id: "orphan", partId: "wing-fin-l", parentId: "ghost", parentSocketId: "s-top", colourId: null },
      ],
    };
    const r = validateBlueprint(bp);
    expect(r.errors.some((e) => e.kind === "missing-parent" || e.kind === "unreachable-part")).toBe(true);
  });

  it("flags unknown partIds", () => {
    const bp: Blueprint = {
      id: "x", name: "x",
      parts: [
        { id: "r", partId: "made-up-core", parentId: null, parentSocketId: null, colourId: null },
      ],
    };
    const r = validateBlueprint(bp);
    expect(r.errors.some((e) => e.kind === "unknown-part")).toBe(true);
  });

  it("flags when total power cost exceeds the core capacity", () => {
    // Starter core capacity = 1; hull-starter costs 1; adding a second
    // (power-costing) part pushes us over budget.
    const bp: Blueprint = {
      id: "x", name: "x",
      parts: [
        { id: "core", partId: "core-starter", parentId: null, parentSocketId: null, colourId: null },
        { id: "hull", partId: "hull-starter", parentId: "core", parentSocketId: "s-hull", colourId: null },
        { id: "wL", partId: "wing-fin-l", parentId: "hull", parentSocketId: "s-top", colourId: null },
      ],
    };
    const r = validateBlueprint(bp);
    expect(r.errors.some((e) => e.kind === "power-over-budget")).toBe(true);
  });
});

describe("canSnap", () => {
  it("accepts a matching hull slot on the core", () => {
    const bp: Blueprint = {
      id: "x", name: "x",
      parts: [
        { id: "core", partId: "core-mid", parentId: null, parentSocketId: null, colourId: null },
      ],
    };
    expect(canSnap(bp, "core", "s-hull", "hull-starter")).toBe(true);
  });

  it("rejects attaching another core", () => {
    const bp: Blueprint = {
      id: "x", name: "x",
      parts: [
        { id: "core", partId: "core-mid", parentId: null, parentSocketId: null, colourId: null },
        { id: "hull", partId: "hull-starter", parentId: "core", parentSocketId: "s-hull", colourId: null },
      ],
    };
    // Cores can't be snapped as children.
    expect(canSnap(bp, "hull", "s-nose", "core-starter")).toBe(false);
  });

  it("rejects when the socket is already occupied", () => {
    const bp: Blueprint = {
      id: "x", name: "x",
      parts: [
        { id: "core", partId: "core-mid", parentId: null, parentSocketId: null, colourId: null },
        { id: "hull", partId: "hull-starter", parentId: "core", parentSocketId: "s-hull", colourId: null },
      ],
    };
    expect(canSnap(bp, "core", "s-hull", "hull-heavy")).toBe(false);
  });

  it("rejects when adding the part would exceed power budget", () => {
    // Starter core cap=1 with the hull already consuming 1 — no room left.
    const bp: Blueprint = {
      id: "x", name: "x",
      parts: [
        { id: "core", partId: "core-starter", parentId: null, parentSocketId: null, colourId: null },
        { id: "hull", partId: "hull-starter", parentId: "core", parentSocketId: "s-hull", colourId: null },
      ],
    };
    expect(canSnap(bp, "hull", "s-nose", "cannon-heavy")).toBe(false);
  });
});
