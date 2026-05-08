/**
 * Solar-system ship builder — modular polygon assembly system.
 *
 * Ships are composed of polygon modules that snap to each other's sides.
 * The root module is always a "core" polygon whose side count is chosen at
 * creation time and fixed thereafter. Every other module connects to an
 * open attachment side on any already-placed module.
 *
 * Budget model:
 *   - Core owns weaponPoints / externalPoints / internalPoints / converterPoints
 *   - Placing weapon/external/internal modules consumes one matching point each
 *   - Converter modules cost from converterPoints and swap ±1 between other pools
 *   - Structure modules are free (no budget cost)
 *   - All ships share the same max part count (50), but parts grow physically
 *     larger with each class tier
 */

// ── Class + type enums ────────────────────────────────────────────────────────

/** 1 = frigate … 9 = titan. */
export type ShipClass = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type SolarModuleType =
  | "core"
  | "weapon"
  | "external"
  | "internal"
  | "structure"
  | "converter"
  | "factory";

/** Semantic function kind — drives visual design and grade-color selection. */
export type PartKind =
  // Weapons
  | "cannon" | "laser" | "torpedo" | "plasma"
  // EW / Sensors
  | "radar" | "lidar" | "scrambler" | "webber"
  // Engines
  | "thruster" | "ion-engine" | "warp-nacelle" | "gravity-drive"
  // Defense
  | "shield" | "armor" | "cloak" | "warp-stabilizer"
  // Support
  | "reactor" | "crew-quarters" | "factory-bay" | "converter-unit"
  // Structure / Core
  | "frame" | "core";

// ── Module definition ─────────────────────────────────────────────────────────

export interface PolygonShape {
  /** Number of sides (3–20). For cores this is a placeholder; coreSideCount overrides. */
  sides: number;
  /** Rendered pixel length of each side at this sizeClass. */
  sideLengthPx: number;
  /**
   * Indices of sides that can accept child modules.
   * null = all sides; [] = no output attachment points (leaf node).
   */
  attachmentSideIndices: number[] | null;
  /**
   * Visual-only vertex override for leaf modules. Unit coords where 1.0 = sideLengthPx.
   * Applied via rotation by rotationRad. Only used for rendering — snap geometry is
   * always computed from the regular N-gon. Safe only on leaf nodes (attachmentSideIndices: []).
   */
  verts?: ReadonlyArray<readonly [number, number]>;
}

export interface ConverterSpec {
  fromType: SolarModuleType;
  toType: SolarModuleType;
  /** Points consumed from converterPoints budget: 5 (lvl1) / 2 (lvl2) / 1 (lvl3). */
  converterBudgetCost: number;
}

export interface ModuleStats {
  hp?: number;
  armor?: number;
  shieldCapacity?: number;
  thrustMs2?: number;
  powerOutput?: number;
  damagePerShot?: number;
  fireRateHz?: number;
  sensorRangeKm?: number;
  /** Factory: max ship class that can be built/fueled/rearmed here. */
  shipFactoryMaxClass?: number;
  /** Shield recharger: shield points restored per second. */
  shieldRechargeRatePerSec?: number;
  /** E-war/special effect tag. */
  specialEffect?: string;
}

export interface SolarModuleDefinition {
  readonly id: string;
  readonly name: string;
  readonly type: SolarModuleType;
  /** Semantic functional kind — drives visual design and grade-color selection. */
  readonly partKind: PartKind;
  readonly sizeClass: ShipClass;
  readonly shape: PolygonShape;
  /** 0 for structure; 1 for weapon/external/internal. */
  readonly budgetCost: number;
  readonly stats: ModuleStats;
  readonly converterSpec?: ConverterSpec;
  readonly shopCost: number;
}

export interface CoreDefinition extends SolarModuleDefinition {
  readonly type: "core";
  readonly variant: "armor" | "power" | "balanced" | "pathfinder" | "raptor" | "wolfpack" | "providence";
  readonly weaponPoints: number;
  readonly externalPoints: number;
  readonly internalPoints: number;
  /** Always 5. */
  readonly converterPoints: number;
  /** Always 50. */
  readonly maxParts: number;
}

// ── Blueprint (save / load format) ───────────────────────────────────────────

export interface PlacedSolarModule {
  readonly placedId: string;
  readonly moduleDefId: string;
  /** null only for the root core. */
  readonly parentPlacedId: string | null;
  /** Which attachment side of the parent this module connects to. */
  readonly parentSideIndex: number | null;
  /** Which side of this module faces the parent. */
  readonly ownSideIndex: number | null;
}

export interface SolarShipBlueprint {
  readonly id: string;
  readonly name: string;
  readonly sizeClass: ShipClass;
  /** Chosen at creation; immutable. Range 3–20. */
  readonly coreSideCount: number;
  /** modules[0] is always the core (parentPlacedId === null). */
  readonly modules: readonly PlacedSolarModule[];
}

// ── Budget ────────────────────────────────────────────────────────────────────

export interface BudgetState {
  readonly weaponUsed: number;
  readonly weaponTotal: number;
  readonly externalUsed: number;
  readonly externalTotal: number;
  readonly internalUsed: number;
  readonly internalTotal: number;
  readonly converterUsed: number;
  readonly converterTotal: number;
  readonly partsUsed: number;
  readonly partsMax: number;
}

// ── Placement result ──────────────────────────────────────────────────────────

export type PlaceResult =
  | { ok: true }
  | { ok: false; reason: "budget" | "size-mismatch" | "side-occupied" | "part-limit" | "no-such-parent" };

// ── Snap points (runtime, never persisted) ────────────────────────────────────

export interface SolarSnapPoint {
  /** placedId of the module that owns this attachment side. */
  readonly ownerPlacedId: string;
  /** Side index on the owner. */
  readonly sideIndex: number;
  /** World-space midpoint of this side. */
  readonly worldX: number;
  readonly worldY: number;
  /** Outward normal angle of this side in radians. */
  readonly normalAngle: number;
  readonly sizeClass: ShipClass;
}

// ── Derived geometry (computed, never stored) ─────────────────────────────────

export interface SideData {
  index: number;
  midX: number;
  midY: number;
  /** Outward normal direction in radians. */
  normalAngle: number;
  /** Whether children can attach here (excluding the parent-connection side). */
  isAttachmentPoint: boolean;
  /** Whether a child is already connected to this side. */
  isOccupied: boolean;
}

export interface ModuleGeometry {
  readonly placedId: string;
  readonly worldX: number;
  readonly worldY: number;
  readonly rotationRad: number;
  readonly vertices: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  /** One entry per polygon side. */
  sides: SideData[];
}

// ── Builder render data (runtime, never persisted) ────────────────────────────

export interface SolarBuilderModuleData {
  readonly placedId: string;
  readonly vertices: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  /** Blueprint-space center of this module — used for exhaust positioning. */
  readonly worldX: number;
  readonly worldY: number;
  readonly moduleType: SolarModuleType;
  readonly partKind: PartKind;
  readonly grade: number;
}

export interface SolarBuilderSnapPointData {
  readonly worldX: number;
  readonly worldY: number;
  /** True when the currently-selected palette item is compatible with this snap. */
  readonly isActive: boolean;
}

export interface SolarBuilderGhostData {
  readonly vertices: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  readonly moduleType: SolarModuleType;
  readonly partKind: PartKind;
  readonly grade: number;
  readonly isSnapped: boolean;
}

export interface SolarBuilderPaletteItem {
  readonly defId: string;
  readonly name: string;
  readonly moduleType: SolarModuleType;
  readonly sizeClass: ShipClass;
  readonly isSelected: boolean;
  readonly quantity: number;
  /** Stock available in the current docked shop, 0 if not stocked. */
  readonly shopStock: number;
  /** Shop buy price (0 when not in shop). */
  readonly shopPrice: number;
}

export interface CorePickerItem {
  readonly defId: string;
  readonly name: string;
  readonly weaponPoints: number;
  readonly externalPoints: number;
  readonly internalPoints: number;
  readonly quantity: number;
}

export interface SolarBuilderContextMenu {
  readonly defId: string;
  readonly name: string;
  readonly moduleType: SolarModuleType;
  readonly screenX: number;
  readonly screenY: number;
  /** Options to display in order. */
  readonly options: ReadonlyArray<"info" | "sell" | "trash">;
}

export interface SavedBlueprintSummary {
  readonly id: string;
  readonly name: string;
  readonly sizeClass: ShipClass;
  readonly coreSideCount: number;
  readonly partCount: number;
  readonly isActive: boolean;
}

export interface SolarShipBuilderRenderData {
  readonly modules: ReadonlyArray<SolarBuilderModuleData>;
  readonly snapPoints: ReadonlyArray<SolarBuilderSnapPointData>;
  readonly ghost: SolarBuilderGhostData | null;
  readonly budget: BudgetState;
  readonly palette: ReadonlyArray<SolarBuilderPaletteItem>;
  readonly statusMsg: string | null;
  readonly shipName: string;
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
  readonly contextMenu: SolarBuilderContextMenu | null;
  readonly playerCredits: number;
  readonly coreSideCount: number;
  readonly savedBlueprints: ReadonlyArray<SavedBlueprintSummary>;
  /** Non-null when the "new ship" core picker is open. */
  readonly corePicker: ReadonlyArray<CorePickerItem> | null;
  /** True when the ship name is being edited. */
  readonly renameMode: boolean;
  /** Current contents of the rename input buffer. */
  readonly renameBuf: string;
}
