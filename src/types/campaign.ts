/**
 * Campaign-mode data model.
 *
 * The arcade-mode types (PlayerState, LevelState, etc.) are untouched. This
 * module introduces the overworld/mission/ship-design types that phases C
 * (campaign) and D (ship builder) layer on top of the existing game.
 */

import type { EnemyType } from "./index";

// ── IDs ─────────────────────────────────────────────────────────────────────

export type NodeId = string;
export type MissionId = string;
export type SectorId = string;
export type PartId = string;
export type ColourId = string;
export type BlueprintId = string;

/** Rare materials economy (phase D+). Declared here so saves round-trip it. */
export type MaterialId =
  | "scrap"
  | "crystal"
  | "void-shard"
  | "plasma-capsule"
  | "circuit-core";

// ── Landmark / mission ──────────────────────────────────────────────────────

export type LandmarkKind =
  | "planet"
  | "asteroid-field"
  | "nebula"
  | "wormhole"
  | "stargate"
  | "station"
  | "halo-ring"
  | "dyson-sphere"
  | "derelict"
  | "pirate-outpost";

export interface SectorNode {
  id: NodeId;
  name: string;
  kind: LandmarkKind;
  /** Screen-space position in the 1280x720 starmap viewport. */
  position: { x: number; y: number };
  /** Missions available at this node. First unlocked = primary. */
  missionIds: MissionId[];
  /** Which nodes unlock when every mission here is completed. */
  unlocksNodeIds: NodeId[];
}

export interface MissionSpec {
  id: MissionId;
  nodeId: NodeId;
  name: string;
  /** 1-5 stars. Drives difficulty scaling and reward size. */
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** Internal level number used when translating to LevelState. */
  levelNumber: number;
  /** Optional enemy-pool override; defaults to progression by levelNumber. */
  enemyRoster?: EnemyType[];
  rewardCredits: number;
  rewardParts: PartId[];
  rewardBlueprints: BlueprintId[];
  rewardMaterials: Partial<Record<MaterialId, number>>;
}

export interface Sector {
  id: SectorId;
  name: string;
  startNodeId: NodeId;
  nodes: Record<NodeId, SectorNode>;
  missions: Record<MissionId, MissionSpec>;
}

// ── Inventory / save state ──────────────────────────────────────────────────

export interface Inventory {
  credits: number;
  materials: Partial<Record<MaterialId, number>>;
  unlockedParts: PartId[];
  unlockedColours: ColourId[];
  blueprints: BlueprintId[];
  /** The currently equipped ship-design blueprint (phase D). */
  equippedBlueprintId: BlueprintId | null;
}

export interface OverworldState {
  schemaVersion: 1;
  sectorId: SectorId;
  currentNodeId: NodeId;
  completedMissionIds: MissionId[];
  unlockedNodeIds: NodeId[];
  inventory: Inventory;
}
