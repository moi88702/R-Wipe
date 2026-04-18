import { describe, expect, it } from "vitest";
import { canSnap, validateBlueprint } from "./assembly";
import type { Blueprint } from "../../types/shipBuilder";

const valid: Blueprint = {
  id: "bp-valid",
  name: "Valid",
  parts: [
    { id: "r", partId: "hull-standard-t1", parentId: null, parentSocketId: null, colourId: null },
    { id: "c", partId: "cockpit-standard-t1", parentId: "r", parentSocketId: "s-nose", colourId: null },
    { id: "wL", partId: "wing-standard-l-t1", parentId: "r", parentSocketId: "s-wingL", colourId: null },
    { id: "wR", partId: "wing-standard-r-t1", parentId: "r", parentSocketId: "s-wingR", colourId: null },
    { id: "e", partId: "engine-standard-t1", parentId: "r", parentSocketId: "s-tail", colourId: null },
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

  it("rejects a non-hull root", () => {
    const bp: Blueprint = {
      id: "x", name: "x",
      parts: [
        { id: "r", partId: "cockpit-standard-t1", parentId: null, parentSocketId: null, colourId: null },
      ],
    };
    const r = validateBlueprint(bp);
    expect(r.errors.some((e) => e.kind === "root-not-hull")).toBe(true);
  });

  it("rejects socket-type mismatches", () => {
    const bp: Blueprint = {
      ...valid,
      parts: [
        { id: "r", partId: "hull-standard-t1", parentId: null, parentSocketId: null, colourId: null },
        // Plug a wing into the cockpit mount — types don't match.
        { id: "wL", partId: "wing-standard-l-t1", parentId: "r", parentSocketId: "s-nose", colourId: null },
      ],
    };
    const r = validateBlueprint(bp);
    expect(r.errors.some((e) => e.kind === "socket-type-mismatch")).toBe(true);
  });

  it("flags duplicate socket usage", () => {
    const bp: Blueprint = {
      ...valid,
      parts: [
        { id: "r", partId: "hull-standard-t1", parentId: null, parentSocketId: null, colourId: null },
        { id: "wL1", partId: "wing-standard-l-t1", parentId: "r", parentSocketId: "s-wingL", colourId: null },
        { id: "wL2", partId: "wing-standard-l-t1", parentId: "r", parentSocketId: "s-wingL", colourId: null },
      ],
    };
    const r = validateBlueprint(bp);
    expect(r.errors.some((e) => e.kind === "duplicate-socket-use")).toBe(true);
  });

  it("flags unreachable parts (detached cluster)", () => {
    const bp: Blueprint = {
      ...valid,
      parts: [
        { id: "r", partId: "hull-standard-t1", parentId: null, parentSocketId: null, colourId: null },
        // Orphan points at a non-existent parent.
        { id: "orphan", partId: "cockpit-standard-t1", parentId: "ghost", parentSocketId: "s-nose", colourId: null },
      ],
    };
    const r = validateBlueprint(bp);
    expect(r.errors.some((e) => e.kind === "missing-parent" || e.kind === "unreachable-part")).toBe(true);
  });

  it("flags unknown partIds", () => {
    const bp: Blueprint = {
      ...valid,
      parts: [
        { id: "r", partId: "made-up-hull", parentId: null, parentSocketId: null, colourId: null },
      ],
    };
    const r = validateBlueprint(bp);
    expect(r.errors.some((e) => e.kind === "unknown-part")).toBe(true);
  });
});

describe("canSnap", () => {
  it("accepts a matching socket on a free mount", () => {
    const bp: Blueprint = {
      id: "x", name: "x",
      parts: [
        { id: "r", partId: "hull-standard-t1", parentId: null, parentSocketId: null, colourId: null },
      ],
    };
    expect(canSnap(bp, "r", "s-nose", "cockpit-standard-t1")).toBe(true);
  });

  it("rejects a type mismatch", () => {
    const bp: Blueprint = {
      id: "x", name: "x",
      parts: [
        { id: "r", partId: "hull-standard-t1", parentId: null, parentSocketId: null, colourId: null },
      ],
    };
    // Wing trying to snap into the cockpit mount — types don't match.
    expect(canSnap(bp, "r", "s-nose", "wing-standard-l-t1")).toBe(false);
  });

  it("rejects an already-occupied socket", () => {
    const bp: Blueprint = {
      id: "x", name: "x",
      parts: [
        { id: "r", partId: "hull-standard-t1", parentId: null, parentSocketId: null, colourId: null },
        { id: "c", partId: "cockpit-standard-t1", parentId: "r", parentSocketId: "s-nose", colourId: null },
      ],
    };
    expect(canSnap(bp, "r", "s-nose", "cockpit-techno-t2")).toBe(false);
  });
});
