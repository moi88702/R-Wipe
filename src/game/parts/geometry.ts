/**
 * Pure geometry for assembled blueprints. Walks parent→child via socket
 * offsets to produce every placed part's world position (with root core at
 * origin) and the aggregate axis-aligned bounding box used as the ship's
 * hitbox and visual silhouette.
 */

import type { Blueprint, PartDef, PlacedPart } from "../../types/shipBuilder";
import { PARTS_REGISTRY } from "./registry";

export interface Placement {
  readonly placed: PlacedPart;
  readonly def: PartDef;
  readonly worldX: number;
  readonly worldY: number;
}

export interface ShipLayout {
  readonly placements: readonly Placement[];
  readonly bbox: {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
    readonly width: number;
    readonly height: number;
  };
}

/** Empty layout returned when the blueprint has no valid root. */
const EMPTY_LAYOUT: ShipLayout = {
  placements: [],
  bbox: { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 },
};

export function layoutBlueprint(blueprint: Blueprint): ShipLayout {
  const root = blueprint.parts.find((p) => p.parentId === null);
  if (!root) return EMPTY_LAYOUT;
  const rootDef = PARTS_REGISTRY[root.partId];
  if (!rootDef) return EMPTY_LAYOUT;

  const byId = new Map<string, PlacedPart>();
  for (const p of blueprint.parts) byId.set(p.id, p);

  const placements: Placement[] = [];
  // BFS; each entry carries its world position.
  const queue: Array<{ placed: PlacedPart; wx: number; wy: number }> = [
    { placed: root, wx: 0, wy: 0 },
  ];
  const visited = new Set<string>([root.id]);

  while (queue.length > 0) {
    const { placed, wx, wy } = queue.shift()!;
    const def = PARTS_REGISTRY[placed.partId];
    if (!def) continue;
    placements.push({ placed, def, worldX: wx, worldY: wy });

    // Find direct children and project them using our sockets.
    for (const child of blueprint.parts) {
      if (child.parentId !== placed.id || visited.has(child.id)) continue;
      const socket = def.sockets.find((sk) => sk.id === child.parentSocketId);
      if (!socket) continue;
      visited.add(child.id);
      queue.push({ placed: child, wx: wx + socket.x, wy: wy + socket.y });
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const pl of placements) {
    const hw = pl.def.shape.width / 2;
    const hh = pl.def.shape.height / 2;
    if (pl.worldX - hw < minX) minX = pl.worldX - hw;
    if (pl.worldX + hw > maxX) maxX = pl.worldX + hw;
    if (pl.worldY - hh < minY) minY = pl.worldY - hh;
    if (pl.worldY + hh > maxY) maxY = pl.worldY + hh;
  }
  if (placements.length === 0 || !isFinite(minX)) {
    return EMPTY_LAYOUT;
  }
  return {
    placements,
    bbox: {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    },
  };
}

/**
 * Returns the world position that a prospective child part would occupy if
 * plugged into `socketId` of `parentPlacedId`. Used by the shipyard to preview
 * a drag/snap target before committing it to the blueprint.
 */
export function previewSocketWorld(
  layout: ShipLayout,
  parentPlacedId: string,
  socketId: string,
): { x: number; y: number } | null {
  const parent = layout.placements.find((p) => p.placed.id === parentPlacedId);
  if (!parent) return null;
  const socket = parent.def.sockets.find((sk) => sk.id === socketId);
  if (!socket) return null;
  return { x: parent.worldX + socket.x, y: parent.worldY + socket.y };
}
