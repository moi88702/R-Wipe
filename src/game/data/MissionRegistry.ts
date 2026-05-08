/**
 * MissionRegistry — static mission templates for the solar system.
 *
 * All missions are `"courier"` (deliver a package) or `"trade"` (acquire items
 * and sell them back). Each mission references a `npcId` that must exist in the
 * NPCRegistry and, for courier missions, a `destinationLocationId` that must
 * exist in the LocationRegistry.
 *
 * Usage:
 *   MissionRegistry.getMission("mission-tf-courier-alpha")
 *   MissionRegistry.getMissionsByFaction("terran-federation")
 *   MissionRegistry.getMissionsByNPC("npc-commander-voss")
 *   MissionRegistry.getMissionsByType("trade")
 */

import type { MissionSpec } from "../../types/missions";

// ── Terran Federation missions ────────────────────────────────────────────────

const TF_COURIER_ALPHA: MissionSpec = {
  id: "mission-tf-courier-alpha",
  npcId: "npc-commander-voss",
  type: "courier",
  title: "Priority Dispatch to Station Beta",
  description:
    "Commander Voss needs a sealed diplomatic package delivered to Void Merchant representatives at Station Beta. Speed and discretion are essential.",
  destinationLocationId: "station-beta",
  packageWeight: 12,
  rewardCredits: 800,
  rewardReputation: 50,
  difficulty: "easy",
  requiredReputation: 0,
};

const TF_PATROL_DISPATCH: MissionSpec = {
  id: "mission-tf-patrol-dispatch",
  npcId: "npc-commander-voss",
  type: "courier",
  title: "Patrol Orders to Frontier Outpost",
  description:
    "Relay updated patrol orders to the skeleton crew manning Outpost Frontier. The Federation needs eyes on the outer approaches.",
  destinationLocationId: "outpost-frontier",
  packageWeight: 2,
  rewardCredits: 600,
  rewardReputation: 40,
  difficulty: "easy",
  requiredReputation: 0,
};

const TF_TRADE_ALLOYS: MissionSpec = {
  id: "mission-tf-trade-alloys",
  npcId: "npc-trader-halley",
  type: "trade",
  title: "Alloy Procurement for Station Alpha",
  description:
    "Halley needs 30 units of refined alloy for station repairs. Bring them back and earn above-market rates.",
  requiredItemType: "alloy",
  requiredItemCount: 30,
  sellPrice: 18,
  rewardCredits: 540,
  rewardReputation: 35,
  difficulty: "easy",
  requiredReputation: 0,
};

// ── Xeno Collective missions ──────────────────────────────────────────────────

const XC_COURIER_NEXUS: MissionSpec = {
  id: "mission-xc-courier-nexus",
  npcId: "npc-emissary-zyx",
  type: "courier",
  title: "Encrypted Data Relay to Crystal Spire",
  description:
    "Emissary Zyx entrusts you with encoded Collective intelligence. Deliver it to Crystal Spire without inspection.",
  destinationLocationId: "crystal-spire",
  packageWeight: 0.5,
  rewardCredits: 1000,
  rewardReputation: 60,
  difficulty: "normal",
  requiredReputation: 50,
};

const XC_TRADE_CRYSTALS: MissionSpec = {
  id: "mission-xc-trade-crystals",
  npcId: "npc-emissary-zyx",
  type: "trade",
  title: "Power Crystal Offering",
  description:
    "The Collective's ritual chambers require 15 power crystals. Bring them to Emissary Zyx and the Collective will reward you generously.",
  requiredItemType: "power-crystal",
  requiredItemCount: 15,
  sellPrice: 60,
  rewardCredits: 900,
  rewardReputation: 70,
  difficulty: "normal",
  requiredReputation: 50,
};

const XC_TRADE_EXOTIC: MissionSpec = {
  id: "mission-xc-trade-exotic",
  npcId: "npc-archivist-krell",
  type: "trade",
  title: "Exotic Matter for the Archive",
  description:
    "Archivist Krell requires 3 units of exotic material for advanced research. This is a rare and dangerous commodity.",
  requiredItemType: "exotic-material",
  requiredItemCount: 3,
  sellPrice: 400,
  rewardCredits: 1200,
  rewardReputation: 100,
  rewardItems: [{ type: "power-crystal", count: 5 }],
  difficulty: "hard",
  requiredReputation: 100,
};

// ── Void Merchants Guild missions ─────────────────────────────────────────────

const VM_COURIER_HUB: MissionSpec = {
  id: "mission-vm-courier-hub",
  npcId: "npc-broker-sable",
  type: "courier",
  title: "Trade Manifest to the Neutral Hub",
  description:
    "Sable needs a cargo manifest delivered to the Neutral Hub trade coordinator before the next market cycle closes.",
  destinationLocationId: "neutral-hub",
  packageWeight: 1,
  rewardCredits: 700,
  rewardReputation: 45,
  difficulty: "easy",
  requiredReputation: 0,
};

const VM_COURIER_BETA: MissionSpec = {
  id: "mission-vm-courier-beta",
  npcId: "npc-broker-sable",
  type: "courier",
  title: "Merchant Credentials to Station Beta",
  description:
    "New merchant credentials need physical delivery to Station Beta's harbormaster. No digital alternatives.",
  destinationLocationId: "station-beta",
  packageWeight: 0.2,
  rewardCredits: 650,
  rewardReputation: 40,
  difficulty: "easy",
  requiredReputation: 0,
};

const VM_TRADE_ALLOYS: MissionSpec = {
  id: "mission-vm-trade-alloys",
  npcId: "npc-captain-mira",
  type: "trade",
  title: "Convoy Supplies: Alloy Run",
  description:
    "Captain Mira's convoy needs 25 alloys to complete repairs mid-route. Bring them and earn a cut of the convoy profits.",
  requiredItemType: "alloy",
  requiredItemCount: 25,
  sellPrice: 20,
  rewardCredits: 500,
  rewardReputation: 30,
  difficulty: "easy",
  requiredReputation: 0,
};

// ── Scavenger Clans missions ──────────────────────────────────────────────────

const SC_COURIER_SALVAGE: MissionSpec = {
  id: "mission-sc-courier-salvage",
  npcId: "npc-chief-rask",
  type: "courier",
  title: "Salvage Docket to the Haven",
  description:
    "Chief Rask needs a salvage docket signed and returned to Scavenger Haven. The Federation can't know about this.",
  destinationLocationId: "scavenger-haven",
  packageWeight: 0.3,
  rewardCredits: 900,
  rewardReputation: 55,
  difficulty: "normal",
  requiredReputation: 0,
};

const SC_TRADE_PARTS: MissionSpec = {
  id: "mission-sc-trade-parts",
  npcId: "npc-chief-rask",
  type: "trade",
  title: "Alloy Parts for the Workshop",
  description:
    "The clan's workshop is running dry. Bring 20 alloy units and Rask will pay well over market.",
  requiredItemType: "alloy",
  requiredItemCount: 20,
  sellPrice: 22,
  rewardCredits: 440,
  rewardReputation: 30,
  difficulty: "easy",
  requiredReputation: 0,
};

const SC_TRADE_CRYSTALS: MissionSpec = {
  id: "mission-sc-trade-crystals",
  npcId: "npc-scrapper-dex",
  type: "trade",
  title: "Crystal Capacitors for the Rig",
  description:
    "Dex is retrofitting a salvaged warship and needs 10 power crystals to power the drives.",
  requiredItemType: "power-crystal",
  requiredItemCount: 10,
  sellPrice: 55,
  rewardCredits: 550,
  rewardReputation: 40,
  difficulty: "normal",
  requiredReputation: -100,
};

// ── Deep Miners Collective missions ───────────────────────────────────────────

const DM_COURIER_GAMMA: MissionSpec = {
  id: "mission-dm-courier-gamma",
  npcId: "npc-foreman-groth",
  type: "courier",
  title: "Mining Quota Report to Deep Core",
  description:
    "Deliver the quarterly production report from Mining Outpost Gamma to the Deep Core Station administrators.",
  destinationLocationId: "deep-core-station",
  packageWeight: 0.1,
  rewardCredits: 650,
  rewardReputation: 45,
  difficulty: "easy",
  requiredReputation: 0,
};

const DM_TRADE_ALLOYS: MissionSpec = {
  id: "mission-dm-trade-alloys",
  npcId: "npc-foreman-groth",
  type: "trade",
  title: "Refined Alloy Bulk Order",
  description:
    "The smelters at Gamma need 40 alloy units to hit this season's quota. Premium rates apply.",
  requiredItemType: "alloy",
  requiredItemCount: 40,
  sellPrice: 16,
  rewardCredits: 640,
  rewardReputation: 50,
  difficulty: "normal",
  requiredReputation: 0,
};

const DM_COURIER_SURVEY: MissionSpec = {
  id: "mission-dm-courier-survey",
  npcId: "npc-geologist-pera",
  type: "courier",
  title: "Survey Data Capsule from Outer Belt",
  description:
    "Geologist Pera's remote drone captured exotic readings from a belt asteroid. Retrieve the data capsule and return it to Mining Outpost Gamma.",
  destinationLocationId: "mining-outpost-gamma",
  packageWeight: 0.5,
  rewardCredits: 1100,
  rewardReputation: 80,
  rewardItems: [{ type: "power-crystal", count: 3 }],
  difficulty: "hard",
  requiredReputation: 50,
};

// ── Nova Rebels missions ──────────────────────────────────────────────────────

const NR_COURIER_REBEL: MissionSpec = {
  id: "mission-nr-courier-rebel",
  npcId: "npc-insurgent-tyne",
  type: "courier",
  title: "Rebel Communiqué to the Base",
  description:
    "Tyne needs an urgent message delivered to Rebel Base command. Do not let it be intercepted.",
  destinationLocationId: "rebel-base",
  packageWeight: 0.1,
  rewardCredits: 950,
  rewardReputation: 65,
  difficulty: "normal",
  requiredReputation: 0,
};

const NR_TRADE_CRYSTALS: MissionSpec = {
  id: "mission-nr-trade-crystals",
  npcId: "npc-insurgent-tyne",
  type: "trade",
  title: "Power Crystals for the Uprising",
  description:
    "Tyne needs 12 power crystals to charge the Rebel's energy weapons before the next operation.",
  requiredItemType: "power-crystal",
  requiredItemCount: 12,
  sellPrice: 58,
  rewardCredits: 696,
  rewardReputation: 60,
  difficulty: "normal",
  requiredReputation: 0,
};

const NR_TRADE_EXOTIC: MissionSpec = {
  id: "mission-nr-trade-exotic",
  npcId: "npc-strategist-orion",
  type: "trade",
  title: "Exotic Payload for the Cause",
  description:
    "Orion's blacksite weapon program needs 2 units of exotic material. The reward will be worth the danger.",
  requiredItemType: "exotic-material",
  requiredItemCount: 2,
  sellPrice: 450,
  rewardCredits: 900,
  rewardReputation: 90,
  rewardMissionUnlock: ["mission-nr-courier-rebel"],
  difficulty: "hard",
  requiredReputation: 50,
};

// ── Explore missions ──────────────────────────────────────────────────────────

const TF_EXPLORE_MARS: MissionSpec = {
  id: "mission-tf-explore-mars",
  npcId: "npc-commander-voss",
  type: "explore",
  title: "Survey Curiosity Base",
  description:
    "We've lost contact with the skeleton crew at Curiosity Base on Mars. Fly out there, dock, and confirm the outpost is still operational. Report back when you return.",
  destinationLocationId: "outpost-mars",
  rewardCredits: 500,
  rewardReputation: 30,
  difficulty: "easy",
  requiredReputation: 0,
};

const DM_EXPLORE_STATION: MissionSpec = {
  id: "mission-dm-explore-station",
  npcId: "npc-foreman-groth",
  type: "explore",
  title: "Dock at Earth Station",
  description:
    "Groth needs a trusted contact to deliver a verbal message to the crew at Earth Station. No radios — the bots intercept everything. Go there in person and return when it's done.",
  destinationLocationId: "station-earth-orbit",
  rewardCredits: 400,
  rewardReputation: 25,
  difficulty: "easy",
  requiredReputation: 0,
};

// ── Kill missions ─────────────────────────────────────────────────────────────

const TF_KILL_PIRATES: MissionSpec = {
  id: "mission-tf-kill-pirates",
  npcId: "npc-commander-voss",
  type: "kill",
  title: "Clear the Pirate Threat",
  description:
    "Scavenger ships have been harassing Federation traffic. Hunt down and destroy 5 pirate vessels operating in the Sol system. Proof of destruction on your scanner is sufficient.",
  killCount: 5,
  rewardCredits: 1200,
  rewardReputation: 80,
  rewardItems: [{ type: "alloy", count: 10 }],
  difficulty: "normal",
  requiredReputation: 0,
};

const SC_KILL_RIVALS: MissionSpec = {
  id: "mission-sc-kill-rivals",
  npcId: "npc-chief-rask",
  type: "kill",
  title: "Eliminate the Rivals",
  description:
    "Rival scavengers are cutting into our salvage routes. Take out 3 of their ships and the territory is ours. Don't leave witnesses.",
  killCount: 3,
  rewardCredits: 800,
  rewardReputation: 60,
  difficulty: "normal",
  requiredReputation: 0,
};

// ── Away missions ─────────────────────────────────────────────────────────────

const NR_ASSAULT_BASE: MissionSpec = {
  id: "mission-nr-assault-base",
  npcId: "npc-strategist-orion",
  type: "away",
  title: "Assault the Pirate Stronghold",
  description:
    "Intel confirms the Scavenger pirate base in Sol is running critical operations against Federation and Rebel alike. Orion wants it gone. Fly to the stronghold and fight your way through in a direct assault. The Rebels will compensate you handsomely.",
  awayBriefing: "ASSAULT BRIEFING: Pirate Stronghold — Sol System\n\nExpect heavy resistance. Multiple waves of armed scavengers. Destroy all hostiles and neutralise the base. Fight hard — no extraction if you go down.",
  rewardCredits: 2500,
  rewardReputation: 150,
  rewardItems: [{ type: "power-crystal", count: 5 }, { type: "exotic-material", count: 1 }],
  difficulty: "hard",
  requiredReputation: 0,
};

const TF_AWAY_PATROL: MissionSpec = {
  id: "mission-tf-away-patrol",
  npcId: "npc-commander-voss",
  type: "away",
  title: "Federation Combat Deployment",
  description:
    "The Federation needs fighters on the front line. Board your combat frame and engage the enemy wave threatening our supply lanes. Clear the zone and return.",
  awayBriefing: "DEPLOYMENT ORDERS: Combat Patrol — Sol System\n\nFederation intelligence has identified a pirate incursion. Your mission: engage and destroy all enemy contacts. You have full Federation authority to engage on sight.",
  rewardCredits: 1800,
  rewardReputation: 100,
  rewardItems: [{ type: "alloy", count: 20 }],
  difficulty: "normal",
  requiredReputation: 0,
};

// ── Registry ──────────────────────────────────────────────────────────────────

/** Explicit faction ownership map: missionId → factionId. */
const MISSION_FACTION: Readonly<Record<string, string>> = Object.freeze({
  "mission-tf-courier-alpha": "terran-federation",
  "mission-tf-patrol-dispatch": "terran-federation",
  "mission-tf-trade-alloys": "terran-federation",
  "mission-xc-courier-nexus": "xeno-collective",
  "mission-xc-trade-crystals": "xeno-collective",
  "mission-xc-trade-exotic": "xeno-collective",
  "mission-vm-courier-hub": "void-merchants",
  "mission-vm-courier-beta": "void-merchants",
  "mission-vm-trade-alloys": "void-merchants",
  "mission-sc-courier-salvage": "scavenger-clans",
  "mission-sc-trade-parts": "scavenger-clans",
  "mission-sc-trade-crystals": "scavenger-clans",
  "mission-dm-courier-gamma": "deep-miners",
  "mission-dm-trade-alloys": "deep-miners",
  "mission-dm-courier-survey": "deep-miners",
  "mission-nr-courier-rebel": "nova-rebels",
  "mission-nr-trade-crystals": "nova-rebels",
  "mission-nr-trade-exotic": "nova-rebels",
  "mission-tf-explore-mars": "terran-federation",
  "mission-dm-explore-station": "deep-miners",
  "mission-tf-kill-pirates": "terran-federation",
  "mission-sc-kill-rivals": "scavenger-clans",
  "mission-nr-assault-base": "nova-rebels",
  "mission-tf-away-patrol": "terran-federation",
});

const ALL_MISSIONS: readonly MissionSpec[] = Object.freeze([
  TF_COURIER_ALPHA,
  TF_PATROL_DISPATCH,
  TF_TRADE_ALLOYS,
  XC_COURIER_NEXUS,
  XC_TRADE_CRYSTALS,
  XC_TRADE_EXOTIC,
  VM_COURIER_HUB,
  VM_COURIER_BETA,
  VM_TRADE_ALLOYS,
  SC_COURIER_SALVAGE,
  SC_TRADE_PARTS,
  SC_TRADE_CRYSTALS,
  DM_COURIER_GAMMA,
  DM_TRADE_ALLOYS,
  DM_COURIER_SURVEY,
  NR_COURIER_REBEL,
  NR_TRADE_CRYSTALS,
  NR_TRADE_EXOTIC,
  TF_EXPLORE_MARS,
  DM_EXPLORE_STATION,
  TF_KILL_PIRATES,
  SC_KILL_RIVALS,
  NR_ASSAULT_BASE,
  TF_AWAY_PATROL,
]);

const MISSION_MAP: Readonly<Record<string, MissionSpec>> = Object.freeze(
  Object.fromEntries(ALL_MISSIONS.map((m) => [m.id, m])),
);

// ── Public API ────────────────────────────────────────────────────────────────

export const MissionRegistry = {
  /**
   * Returns the mission spec for the given id, or `undefined` if unknown.
   */
  getMission(id: string): MissionSpec | undefined {
    return MISSION_MAP[id];
  },

  /**
   * Returns every mission spec.
   */
  getAllMissions(): readonly MissionSpec[] {
    return ALL_MISSIONS;
  },

  /**
   * Returns all mission ids.
   */
  getAllMissionIds(): string[] {
    return ALL_MISSIONS.map((m) => m.id);
  },

  /**
   * Returns missions belonging to the given faction.
   */
  getMissionsByFaction(factionId: string): MissionSpec[] {
    return ALL_MISSIONS.filter(
      (m) => MISSION_FACTION[m.id] === factionId,
    );
  },

  /**
   * Returns missions offered by the given NPC id.
   */
  getMissionsByNPC(npcId: string): MissionSpec[] {
    return ALL_MISSIONS.filter((m) => m.npcId === npcId);
  },

  /**
   * Returns missions of the given type.
   */
  getMissionsByType(type: MissionSpec["type"]): MissionSpec[] {
    return ALL_MISSIONS.filter((m) => m.type === type);
  },

  /**
   * Returns the faction id that owns a mission.
   * Returns `undefined` if the mission id is not recognised.
   */
  getFactionForMission(missionId: string): string | undefined {
    return MISSION_FACTION[missionId];
  },
} as const;
