/**
 * Resource and inventory data models for the Open World Solar System
 * Exploration feature.
 *
 * Covers harvestable resource deposits scattered across the map, the player's
 * persistent resource inventory, and an active harvesting session.
 */

// ── Resource Deposits ────────────────────────────────────────────────────────

/**
 * A harvestable resource deposit located in world space.
 * Deposits are procedurally placed using the system seed; zone difficulty
 * controls how much material is available.
 */
export interface ResourceDeposit {
  /** Unique deposit id, e.g. "deposit-alloy-001". */
  id: string;
  /** Resource type the deposit yields. */
  type: "alloy" | "power-crystal" | "exotic-material";
  /** World-space position (km). */
  position: { x: number; y: number };
  /** Units of resource remaining in this deposit. Decreases as player harvests. */
  quantityAvailable: number;
  /** Harvest speed (units per second) when the player is actively collecting. */
  harvestRatePerSecond: number;
  /**
   * Zone difficulty where this deposit was placed.
   * Easy zones have scarce deposits; hard zones have abundant ones.
   */
  zoneDifficulty: "easy" | "normal" | "hard";
}

// ── Player Inventory ─────────────────────────────────────────────────────────

/**
 * The player's persistent resource inventory.
 * Extended into the existing `rwipe.overworld.v1` localStorage slot.
 */
export interface ResourceInventory {
  /** Current credit balance. */
  credits: number;
  /** Alloy units held. Used for capital ship upgrades and trade. */
  alloys: number;
  /** Power crystal units held. Used for high-tier upgrades and special systems. */
  powerCrystals: number;
  /** Exotic material units held. Rare; used for the rarest upgrade tiers. */
  exoticMaterial: number;
  /**
   * Temporary items being carried for active trade missions.
   * Key: itemType string (matches `MissionSpec.requiredItemType`).
   * Value: units currently held.
   * Cleared on mission completion, failure, or abandonment.
   */
  carriedItems: Record<string, number>;
}

// ── Harvesting Session ───────────────────────────────────────────────────────

/**
 * Tracks an in-progress resource harvesting operation.
 * Created when the player activates the [COLLECT] action on a deposit and
 * discarded when collection completes, is cancelled, or the player moves away.
 */
export interface HarvestingSession {
  /** Id of the `ResourceDeposit` being harvested. */
  depositId: string;
  /** Unix timestamp (ms) when collection began. */
  startedAt: number;
  /** Projected Unix timestamp (ms) when the current harvest batch finishes. */
  estimatedCompletionMs: number;
  /** Units collected so far in this session. */
  currentAmountCollected: number;
}
