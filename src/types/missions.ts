/**
 * Solar system mission log data models.
 *
 * Covers the courier/trade mission specification, the player's persistent
 * mission log, and waypoint markers displayed on the map.
 *
 * Note: this `MissionSpec` is the **solar system** variant (courier/trade).
 * The campaign mode mission spec lives in `src/types/campaign.ts`.
 */

// ── Mission Specification ────────────────────────────────────────────────────

/**
 * Template for a mission offered by an NPC in a solar system location.
 * Defines the objective, requirements, and reward for a single mission.
 */
export interface MissionSpec {
  /** Unique mission id, e.g. "courier-kepler-001". */
  id: string;
  /** Id of the NPC offering this mission. */
  npcId: string;
  /**
   * Mission category.
   * - `"courier"` — deliver a package to a destination location.
   * - `"trade"` — acquire a specific item type and sell it back to the NPC.
   */
  type: "courier" | "trade";
  /** Short display title shown in the mission log and NPC dialogue. */
  title: string;
  /** Longer flavour description presented in the mission detail view. */
  description: string;

  // ── Courier fields (type === "courier") ──────────────────────────────────
  /** Location id where the package must be delivered. */
  destinationLocationId?: string;
  /** Flavour weight of the package (kg); no gameplay effect. */
  packageWeight?: number;

  // ── Trade fields (type === "trade") ──────────────────────────────────────
  /** Item type the NPC wants (e.g. "alloy", "power-crystal"). */
  requiredItemType?: string;
  /** Number of units the NPC requires. */
  requiredItemCount?: number;
  /** Credits per unit the NPC will pay (above open-market price). */
  sellPrice?: number;

  // ── Rewards ───────────────────────────────────────────────────────────────
  /** Credit reward on mission completion. */
  rewardCredits: number;
  /** Faction reputation gained on completion (positive). */
  rewardReputation: number;
  /** Optional item rewards granted on completion. */
  rewardItems?: Array<{ type: string; count: number }>;
  /** Optional mission ids unlocked in the same NPC's roster on completion. */
  rewardMissionUnlock?: string[];

  // ── Requirements ─────────────────────────────────────────────────────────
  /** Subjective difficulty displayed in the mission listing. */
  difficulty: "easy" | "normal" | "hard";
  /**
   * Minimum faction reputation the player must have to accept this mission.
   * Absent means no standing requirement.
   */
  requiredReputation?: number;
}

// ── Mission Log ───────────────────────────────────────────────────────────────

/**
 * A single entry in the player's persistent mission log.
 * Created when the player accepts a `MissionSpec` from an NPC.
 */
export interface MissionLogEntry {
  /** Id from the accepted `MissionSpec`. */
  missionId: string;
  /** Id of the NPC that offered the mission. */
  npcId: string;
  /** Unix timestamp (ms) when the player accepted the mission. */
  acceptedAt: number;
  /**
   * Current lifecycle state.
   * - `"active"` — in progress.
   * - `"completed"` — objectives met, rewards granted.
   * - `"failed"` — failed (e.g. ship destroyed while carrying package).
   * - `"abandoned"` — player manually abandoned.
   */
  status: "active" | "completed" | "failed" | "abandoned";
  /**
   * Mission-specific progress payload.
   * For courier: tracks whether package has been picked up.
   * For trade: tracks items collected so far.
   */
  progressData?: Record<string, unknown>;
  /**
   * Waypoint assignments for this mission entry.
   * Each slot holds a location id or celestial body id, or `null` if unset.
   */
  waypointAssignments: {
    primary: string | null;
    secondary: string | null;
    tertiary: string | null;
  };
}

/**
 * Persisted mission log state.
 * Stored in the `rwipe.missions.v1` localStorage slot.
 */
export interface MissionLogState {
  /** All mission log entries (active, completed, failed, abandoned). */
  entries: MissionLogEntry[];
  /**
   * Fast-lookup set of all mission ids the player has ever completed.
   * Used for prerequisite checks on location docking and mission unlock.
   */
  completedMissionIds: Set<string>;
  /** Unix timestamp (ms) of the last mutation. */
  lastUpdatedAt: number;
}

// ── Waypoints ─────────────────────────────────────────────────────────────────

/**
 * A single map waypoint marker displayed on the solar system view.
 * Players can set primary, secondary, and tertiary waypoints independently.
 *
 * Colour conventions:
 *   primary   → cyan    (0, 255, 255)
 *   secondary → yellow  (255, 255, 0)
 *   tertiary  → magenta (255, 0, 255)
 */
export interface Waypoint {
  /** Unique waypoint instance id. */
  id: string;
  /** Slot this waypoint occupies on the map HUD. */
  type: "primary" | "secondary" | "tertiary";
  /** Id of the target location or celestial body. */
  targetId: string;
  /** Cached world-space position (km) of the target. Updated each orbital tick. */
  targetPosition: { x: number; y: number };
  /** Render colour (0–255 per channel). See colour conventions above. */
  color: { r: number; g: number; b: number };
  /** Mission log entry id that set this waypoint, if any. */
  assignedMissionId?: string;
}
