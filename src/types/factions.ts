/**
 * Faction system data models for the Open World Solar System Exploration feature.
 *
 * Covers faction definitions, player reputation standings, takeover events,
 * and the persisted standings snapshot.
 */

// ── Faction Definition ───────────────────────────────────────────────────────

/**
 * Static definition of a faction in the game world.
 * Loaded from the FactionRegistry; never mutated during play.
 */
export interface FactionDefinition {
  /** Unique faction identifier, e.g. "terran", "xeno", "pirates". */
  id: string;
  /** Full display name shown in the UI. */
  name: string;
  /** Faction colour used on map markers and UI accents (0–255 per channel). */
  color: { r: number; g: number; b: number };
  /** NPC ids affiliated with this faction by default. */
  baselineNpcs: string[];
  /** Location ids initially controlled by this faction at system generation. */
  baselineLocations: string[];
  /** Faction ids that are allied with this faction (reputation gain is shared). */
  allies: string[];
  /** Faction ids that are at war with this faction. */
  enemies: string[];
}

// ── Player Standings ─────────────────────────────────────────────────────────

/**
 * The player's standing with a single faction.
 * `reputation` is the canonical numeric value; derived flags are computed
 * and cached here for fast lookup during docking permission checks.
 */
export interface FactionStanding {
  /** The faction this standing record refers to. */
  factionId: string;
  /**
   * Numeric reputation with this faction.
   * Range: −1000 (maximum hostility) to +1000 (maximum alliance).
   * Docking typically requires ≥ 0; hostility threshold is ≤ −300.
   */
  reputation: number;
  /** Total missions completed on behalf of this faction (for UI display). */
  missionsDoneCount: number;
  /**
   * Location ids where the player is currently permitted to dock.
   * Recomputed whenever `reputation` changes.
   */
  canDockAt: Set<string>;
  /**
   * When true the faction attacks the player on sight.
   * Typically set when `reputation ≤ −300`.
   */
  isHostile: boolean;
}

/**
 * Persisted snapshot of the player's standing with every faction.
 * Stored in the `rwipe.factions.v1` localStorage slot.
 */
export interface FactionStandingsState {
  /** Map of factionId → standing record. */
  standings: Record<string, FactionStanding>;
  /** Unix timestamp (ms) of the last mutation. */
  lastUpdatedAt: number;
}

// ── Takeover Events ──────────────────────────────────────────────────────────

/**
 * Records a faction seizing control of a location.
 * Appended to the solar system's `StateChangeLog` on takeover.
 * Takeovers are explicit and designer-triggered — not automated.
 */
export interface FactionTakeoverEvent {
  /** Unix timestamp (ms) when the takeover occurred. */
  timestamp: number;
  /** Id of the location that changed hands. */
  locationId: string;
  /** Faction that previously controlled the location. */
  oldFactionId: string;
  /** Faction that now controls the location. */
  newFactionId: string;
  /**
   * What triggered the takeover.
   * - `"reputation-threshold"` — player's standing caused a faction flip.
   * - `"story-milestone"` — a scripted story beat caused the handover.
   */
  trigger: "reputation-threshold" | "story-milestone";
}
