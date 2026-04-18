/**
 * Hand-authored starter sector for the campaign MVP. Five nodes in a linear
 * chain — completing each one unlocks the next. Last node is the sector
 * boss. Phase C scope; expansion happens in later content passes.
 */

import type {
  MissionSpec,
  Sector,
  SectorNode,
} from "../../types/campaign";

const startNode: SectorNode = {
  id: "n1-outpost",
  name: "Cygnus Outpost",
  kind: "station",
  position: { x: 200, y: 500 },
  missionIds: ["m1-outpost-patrol"],
  unlocksNodeIds: ["n2-asteroids"],
};

const asteroidsNode: SectorNode = {
  id: "n2-asteroids",
  name: "Blackrock Belt",
  kind: "asteroid-field",
  position: { x: 430, y: 380 },
  missionIds: ["m2-asteroid-sweep"],
  unlocksNodeIds: ["n3-nebula"],
};

const nebulaNode: SectorNode = {
  id: "n3-nebula",
  name: "Veil Nebula",
  kind: "nebula",
  position: { x: 660, y: 260 },
  missionIds: ["m3-nebula-hunt"],
  unlocksNodeIds: ["n4-derelict"],
};

const derelictNode: SectorNode = {
  id: "n4-derelict",
  name: "ISS Morrigan (derelict)",
  kind: "derelict",
  position: { x: 890, y: 380 },
  missionIds: ["m4-derelict-salvage"],
  unlocksNodeIds: ["n5-pirate"],
};

const pirateNode: SectorNode = {
  id: "n5-pirate",
  name: "Ironfang Outpost",
  kind: "pirate-outpost",
  position: { x: 1080, y: 220 },
  missionIds: ["m5-pirate-boss"],
  unlocksNodeIds: [],
};

const missions: Record<string, MissionSpec> = {
  "m1-outpost-patrol": {
    id: "m1-outpost-patrol",
    nodeId: "n1-outpost",
    name: "Outpost Patrol",
    difficulty: 1,
    levelNumber: 1,
    rewardCredits: 200,
    rewardParts: [],
    rewardBlueprints: [],
    rewardMaterials: { scrap: 5 },
  },
  "m2-asteroid-sweep": {
    id: "m2-asteroid-sweep",
    nodeId: "n2-asteroids",
    name: "Asteroid Sweep",
    difficulty: 2,
    levelNumber: 2,
    rewardCredits: 400,
    rewardParts: ["hull-reinforced-t1"],
    rewardBlueprints: [],
    rewardMaterials: { scrap: 10, crystal: 1 },
  },
  "m3-nebula-hunt": {
    id: "m3-nebula-hunt",
    nodeId: "n3-nebula",
    name: "Ghosts in the Veil",
    difficulty: 3,
    levelNumber: 3,
    rewardCredits: 700,
    rewardParts: ["wing-armoured-t2"],
    rewardBlueprints: [],
    rewardMaterials: { scrap: 15, crystal: 2 },
  },
  "m4-derelict-salvage": {
    id: "m4-derelict-salvage",
    nodeId: "n4-derelict",
    name: "Derelict Salvage",
    difficulty: 4,
    levelNumber: 4,
    rewardCredits: 1200,
    rewardParts: ["cockpit-techno-t2"],
    rewardBlueprints: ["bp-interceptor-mk1"],
    rewardMaterials: { scrap: 25, crystal: 3, "circuit-core": 1 },
  },
  "m5-pirate-boss": {
    id: "m5-pirate-boss",
    nodeId: "n5-pirate",
    name: "Ironfang's Wake",
    difficulty: 5,
    levelNumber: 5,
    rewardCredits: 2500,
    rewardParts: ["engine-plasma-t3"],
    rewardBlueprints: ["bp-gunship-mk1"],
    rewardMaterials: { crystal: 5, "plasma-capsule": 2, "void-shard": 1 },
  },
};

export const STARTER_SECTOR: Sector = {
  id: "sec-cygnus",
  name: "Cygnus Sector",
  startNodeId: startNode.id,
  nodes: {
    [startNode.id]: startNode,
    [asteroidsNode.id]: asteroidsNode,
    [nebulaNode.id]: nebulaNode,
    [derelictNode.id]: derelictNode,
    [pirateNode.id]: pirateNode,
  },
  missions,
};
