/**
 * Ship-builder data model (v2).
 *
 * Every blueprint is rooted on a POWER CORE. Each other part has a `powerCost`
 * that draws from the core's `powerCapacity`. Assembling a ship is therefore
 * a power-budget puzzle: bigger parts cost more, stronger cores allow more.
 *
 * Parts have an explicit `shape` ({width, height}) in 1x-scale pixels and a
 * `visualKind` string driving how the renderer draws them. The ship's hitbox
 * is the axis-aligned bounding box of every placed part's world position —
 * exactly matching the ship's silhouette.
 */
import type { PartId, ColourId, BlueprintId } from "./campaign";

export type PartCategory =
  | "core"
  | "hull"
  | "wing"
  | "cockpit"
  | "engine"
  | "weapon"
  | "utility";

/** One socket type for v2. Anything plugs into anything that's free. */
export type SocketType = "mount";

export interface Socket {
  id: string;
  type: SocketType;
  /** Offset of the socket from the part's own center, 1x scale pixels. */
  x: number;
  y: number;
}

export type BayCategory = "primary" | "utility" | "defensive" | "engine" | "reactor";

export interface StatDelta {
  hpDelta?: number;
  speedDelta?: number;
  fireRateDelta?: number;
  damageDelta?: number;
  bays?: Partial<Record<BayCategory, number>>;
  cost?: number;
}

export interface PartDef {
  readonly id: PartId;
  readonly category: PartCategory;
  readonly name: string;
  readonly tier: 1 | 2 | 3;
  /** Axis-aligned bounding rect centered on the part's origin. */
  readonly shape: { readonly width: number; readonly height: number };
  /** Tag consumed by the renderer to pick a drawing routine. */
  readonly visualKind: string;
  /** Default colour (0xRRGGBB). */
  readonly colour: number;
  /** Child attach points (child's center lands at socket x,y offset from us). */
  readonly sockets: readonly Socket[];
  /** Socket type this part connects into on its parent. `null` only for core. */
  readonly plugsInto: SocketType | null;
  /** Power this part draws. 0 for cores (they produce, not consume). */
  readonly powerCost: number;
  /** Power this part produces. Non-zero only on cores. */
  readonly powerCapacity?: number;
  readonly stats: StatDelta;
}

export interface PlacedPart {
  id: string;
  partId: PartId;
  parentId: string | null;
  parentSocketId: string | null;
  colourId: ColourId | null;
}

export interface Blueprint {
  id: BlueprintId;
  name: string;
  /** First entry (and only part with parentId=null) must be a core. */
  parts: PlacedPart[];
}

export interface ShipStats {
  hp: number;
  speed: number;
  fireRate: number;
  damage: number;
  bays: Record<BayCategory, number>;
  /** AABB of the assembled silhouette, computed by `geometry.ts`. */
  hitbox: { width: number; height: number };
  cost: number;
  powerUsed: number;
  powerCapacity: number;
}
