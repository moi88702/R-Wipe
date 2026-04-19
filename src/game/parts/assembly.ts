/**
 * Pure assembly validator for ship blueprints (v2).
 *
 * Invariants:
 *  1. Exactly one root, and that root is a CORE.
 *  2. Every non-root part cites a parent + socket that exist, and the socket
 *     is of type `mount` (only socket type today).
 *  3. No socket is used by more than one child.
 *  4. Every part is reachable from the root.
 *  5. Total powerCost across non-core parts ≤ root core's powerCapacity.
 *
 * `canSnap(blueprint, parentId, socketId, childPartId)` is the editor-side
 * check that also accounts for the power budget.
 */

import type { Blueprint, PartDef, SocketType } from "../../types/shipBuilder";
import { PARTS_REGISTRY } from "./registry";

export type AssemblyError =
  | { kind: "no-root" }
  | { kind: "multiple-roots"; ids: string[] }
  | { kind: "root-not-core"; id: string }
  | { kind: "unknown-part"; id: string; partId: string }
  | { kind: "missing-parent"; id: string; parentId: string }
  | { kind: "missing-socket"; id: string; parentSocketId: string }
  | { kind: "socket-type-mismatch"; id: string; expected: SocketType; got: SocketType }
  | { kind: "duplicate-socket-use"; parentId: string; socketId: string; parts: string[] }
  | { kind: "unreachable-part"; id: string }
  | { kind: "power-over-budget"; used: number; capacity: number };

export interface AssemblyReport {
  ok: boolean;
  errors: AssemblyError[];
}

export function validateBlueprint(blueprint: Blueprint): AssemblyReport {
  const errors: AssemblyError[] = [];
  const parts = blueprint.parts;

  const roots = parts.filter((p) => p.parentId === null);
  if (roots.length === 0) {
    errors.push({ kind: "no-root" });
  } else if (roots.length > 1) {
    errors.push({ kind: "multiple-roots", ids: roots.map((r) => r.id) });
  }
  const rootPart = roots[0];
  let rootDef: PartDef | undefined;
  if (rootPart) {
    rootDef = PARTS_REGISTRY[rootPart.partId];
    if (!rootDef) {
      errors.push({ kind: "unknown-part", id: rootPart.id, partId: rootPart.partId });
    } else if (rootDef.category !== "core") {
      errors.push({ kind: "root-not-core", id: rootPart.id });
    }
  }

  const byId = new Map(parts.map((p) => [p.id, p]));
  const socketUse = new Map<string, string[]>();

  for (const p of parts) {
    const def = PARTS_REGISTRY[p.partId];
    if (!def) {
      errors.push({ kind: "unknown-part", id: p.id, partId: p.partId });
      continue;
    }
    if (p.parentId === null) continue;
    const parent = byId.get(p.parentId);
    if (!parent) {
      errors.push({ kind: "missing-parent", id: p.id, parentId: p.parentId });
      continue;
    }
    const parentDef: PartDef | undefined = PARTS_REGISTRY[parent.partId];
    if (!parentDef) continue;
    const socketId = p.parentSocketId;
    if (!socketId) {
      errors.push({ kind: "missing-socket", id: p.id, parentSocketId: "" });
      continue;
    }
    const socket = parentDef.sockets.find((sk) => sk.id === socketId);
    if (!socket) {
      errors.push({ kind: "missing-socket", id: p.id, parentSocketId: socketId });
      continue;
    }
    if (def.plugsInto !== null && socket.type !== def.plugsInto) {
      errors.push({
        kind: "socket-type-mismatch",
        id: p.id,
        expected: def.plugsInto,
        got: socket.type,
      });
      continue;
    }
    const key = `${parent.id}:${socketId}`;
    const users = socketUse.get(key) ?? [];
    users.push(p.id);
    socketUse.set(key, users);
  }

  for (const [key, users] of socketUse) {
    if (users.length > 1) {
      const [parentId, socketId] = key.split(":");
      errors.push({
        kind: "duplicate-socket-use",
        parentId: parentId!,
        socketId: socketId!,
        parts: users,
      });
    }
  }

  // Reachability BFS from root.
  if (rootPart && !errors.some((e) => e.kind === "multiple-roots")) {
    const reachable = new Set<string>([rootPart.id]);
    const queue = [rootPart.id];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (const p of parts) {
        if (p.parentId === currentId && !reachable.has(p.id)) {
          reachable.add(p.id);
          queue.push(p.id);
        }
      }
    }
    for (const p of parts) {
      if (!reachable.has(p.id)) {
        errors.push({ kind: "unreachable-part", id: p.id });
      }
    }
  }

  // Power budget.
  if (rootDef && rootDef.category === "core") {
    const capacity = rootDef.powerCapacity ?? 0;
    let used = 0;
    for (const p of parts) {
      if (p.parentId === null) continue;
      const d = PARTS_REGISTRY[p.partId];
      if (!d) continue;
      used += d.powerCost;
    }
    if (used > capacity) {
      errors.push({ kind: "power-over-budget", used, capacity });
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Returns true when a prospective snap is valid: socket exists, is free, and
 * attaching the child would not exceed the core's power capacity.
 */
export function canSnap(
  blueprint: Blueprint,
  parentPlacedId: string,
  socketId: string,
  childPartId: string,
): boolean {
  const parent = blueprint.parts.find((p) => p.id === parentPlacedId);
  if (!parent) return false;
  const parentDef = PARTS_REGISTRY[parent.partId];
  const childDef = PARTS_REGISTRY[childPartId];
  if (!parentDef || !childDef) return false;
  // Can't attach another core.
  if (childDef.category === "core") return false;
  const socket = parentDef.sockets.find((sk) => sk.id === socketId);
  if (!socket) return false;
  if (childDef.plugsInto !== null && socket.type !== childDef.plugsInto) return false;
  const occupied = blueprint.parts.some(
    (p) => p.parentId === parentPlacedId && p.parentSocketId === socketId,
  );
  if (occupied) return false;

  // Power check.
  const root = blueprint.parts.find((p) => p.parentId === null);
  if (!root) return false;
  const rootDef = PARTS_REGISTRY[root.partId];
  if (!rootDef || rootDef.category !== "core") return false;
  const capacity = rootDef.powerCapacity ?? 0;
  let used = 0;
  for (const p of blueprint.parts) {
    if (p.parentId === null) continue;
    const d = PARTS_REGISTRY[p.partId];
    if (!d) continue;
    used += d.powerCost;
  }
  return used + childDef.powerCost <= capacity;
}
