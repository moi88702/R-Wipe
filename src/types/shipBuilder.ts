/**
 * Ship-builder data model.
 *
 * Pure types — no runtime behaviour. Parts live in a registry keyed by PartId
 * and are composed into a Blueprint through the pure `assembly.ts` layer.
 * Actual stat application into the player's ship happens at mission start via
 * `computeShipStats(blueprint)` → PlayerManager overrides.
 */

import type { PartId, ColourId, BlueprintId } from "./campaign";

/**
 * Categories of parts. Each slot on the ship silhouette accepts one category
 * (hull → the spine, cockpit → nose, wings → left/right flanks, engine →
 * stern). Ability bays are expressed as sub-mounts on specific parts.
 */
export type PartCategory = "hull" | "cockpit" | "wing" | "engine";

/**
 * Typed snap sockets. Only matching socket types connect, which keeps the
 * assembly validator from suggesting nonsense (e.g. a wing trying to snap
 * into a cockpit mount). Mirrored sockets (wing-left / wing-right) exist so
 * a single wing part can be placed on either flank.
 */
export type SocketType =
  | "hull-front"
  | "hull-back"
  | "hull-left"
  | "hull-right"
  | "cockpit-mount"
  | "wing-root-left"
  | "wing-root-right"
  | "engine-mount";

export interface Socket {
  id: string;
  type: SocketType;
  /** Offset from the part's origin, in 1x scale pixels. */
  x: number;
  y: number;
}

export interface StatDelta {
  hpDelta?: number;
  speedDelta?: number;
  fireRateDelta?: number;
  damageDelta?: number;
  /** Additional bays the part provides, keyed by category. */
  bays?: Partial<Record<BayCategory, number>>;
  /** Hitbox footprint contribution (width × height) in 1x scale pixels. */
  hitboxWidth?: number;
  hitboxHeight?: number;
  /** Production cost in credits. */
  cost?: number;
}

export type BayCategory = "primary" | "utility" | "defensive" | "engine" | "reactor";

export interface PartDef {
  readonly id: PartId;
  readonly category: PartCategory;
  readonly name: string;
  readonly tier: 1 | 2 | 3;
  /** Sockets this part exposes to other parts. */
  readonly sockets: readonly Socket[];
  /** Which SocketType on the parent this part plugs into. */
  readonly plugsInto: SocketType;
  readonly stats: StatDelta;
}

/**
 * One placed part inside a Blueprint. The `parentId` / `parentSocketId` pair
 * describes the edge in the assembly tree — the root part has `parentId: null`
 * and its own hull.
 */
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
  /** The placed parts in the blueprint. First entry is the root hull. */
  parts: PlacedPart[];
}

/** Aggregate stats computed from a blueprint's parts. */
export interface ShipStats {
  hp: number;
  speed: number;
  fireRate: number;
  damage: number;
  bays: Record<BayCategory, number>;
  hitbox: { width: number; height: number };
  cost: number;
}
