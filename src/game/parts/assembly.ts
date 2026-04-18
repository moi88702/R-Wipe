/**
 * Pure assembly validator for ship blueprints.
 *
 * Three invariants:
 *  1. Exactly one root (a hull with `parentId: null`).
 *  2. Every non-root part cites a parent that exists, and plugs into a socket
 *     that exists on that parent and whose type matches `part.plugsInto`.
 *  3. Every part is reachable from the root via a BFS over the assembly tree —
 *     no detached clusters.
 *
 * Also provides `canSnap(parent, child, socketId)` used by the editor to
 * decide if a drag-drop is valid before committing it to the blueprint.
 *
 * No Pixi, no side effects. Tested directly.
 */

import type { Blueprint, PartDef, SocketType } from "../../types/shipBuilder";
import { PARTS_REGISTRY } from "./registry";

export type AssemblyError =
  | { kind: "no-root" }
  | { kind: "multiple-roots"; ids: string[] }
  | { kind: "root-not-hull"; id: string }
  | { kind: "unknown-part"; id: string; partId: string }
  | { kind: "missing-parent"; id: string; parentId: string }
  | { kind: "missing-socket"; id: string; parentSocketId: string }
  | { kind: "socket-type-mismatch"; id: string; expected: SocketType; got: SocketType }
  | { kind: "duplicate-socket-use"; parentId: string; socketId: string; parts: string[] }
  | { kind: "unreachable-part"; id: string };

export interface AssemblyReport {
  ok: boolean;
  errors: AssemblyError[];
}

/** Validate a blueprint. Returns a report with every issue found. */
export function validateBlueprint(blueprint: Blueprint): AssemblyReport {
  const errors: AssemblyError[] = [];
  const parts = blueprint.parts;

  // Root(s)
  const roots = parts.filter((p) => p.parentId === null);
  if (roots.length === 0) {
    errors.push({ kind: "no-root" });
  } else if (roots.length > 1) {
    errors.push({ kind: "multiple-roots", ids: roots.map((r) => r.id) });
  }
  const rootPart = roots[0];
  if (rootPart) {
    const def = PARTS_REGISTRY[rootPart.partId];
    if (!def) {
      errors.push({ kind: "unknown-part", id: rootPart.id, partId: rootPart.partId });
    } else if (def.category !== "hull") {
      errors.push({ kind: "root-not-hull", id: rootPart.id });
    }
  }

  // Part existence + parent/socket checks.
  const byId = new Map(parts.map((p) => [p.id, p]));
  // Track which (parent,socket) pairs are in use so we can flag double-plugs.
  const socketUse = new Map<string, string[]>(); // "parentId:socketId" → [placed.id,…]

  for (const p of parts) {
    const def = PARTS_REGISTRY[p.partId];
    if (!def) {
      errors.push({ kind: "unknown-part", id: p.id, partId: p.partId });
      continue;
    }
    if (p.parentId === null) continue; // root handled above
    const parent = byId.get(p.parentId);
    if (!parent) {
      errors.push({ kind: "missing-parent", id: p.id, parentId: p.parentId });
      continue;
    }
    const parentDef: PartDef | undefined = PARTS_REGISTRY[parent.partId];
    if (!parentDef) continue; // already flagged as unknown-part
    const socketId = p.parentSocketId;
    if (!socketId) {
      errors.push({ kind: "missing-socket", id: p.id, parentSocketId: "" });
      continue;
    }
    const socket = parentDef.sockets.find((s) => s.id === socketId);
    if (!socket) {
      errors.push({ kind: "missing-socket", id: p.id, parentSocketId: socketId });
      continue;
    }
    if (socket.type !== def.plugsInto) {
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

  // Reachability BFS from the root.
  if (rootPart && errors.every((e) => e.kind !== "multiple-roots")) {
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

  return { ok: errors.length === 0, errors };
}

/**
 * Returns true when `childPartId` can legitimately plug into socket `socketId`
 * on `parentPlacedId` (a part already in `blueprint`). Used by the editor to
 * decide whether a drag-drop produces a valid snap before committing.
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
  const socket = parentDef.sockets.find((s) => s.id === socketId);
  if (!socket) return false;
  if (socket.type !== childDef.plugsInto) return false;
  // Socket must not already be occupied.
  const occupied = blueprint.parts.some(
    (p) => p.parentId === parentPlacedId && p.parentSocketId === socketId,
  );
  return !occupied;
}
