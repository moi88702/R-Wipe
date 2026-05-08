/**
 * NPCRegistry — static definitions for all non-player characters.
 *
 * NPCs are pure, immutable data. Each NPC has:
 *   - A faction affiliation
 *   - A display name and short dialogue stub
 *   - A list of mission ids they offer
 *
 * Usage:
 *   NPCRegistry.getNPC("npc-commander-voss")
 *   NPCRegistry.getNPCsByFaction("terran-federation")
 *   NPCRegistry.getAllNPCs()
 */

// ── NPC definition ─────────────────────────────────────────────────────────────

export interface NPCDefinition {
  /** Unique NPC id referenced by FactionRegistry and LocationRegistry. */
  id: string;
  /** Player-facing display name. */
  name: string;
  /** The faction this NPC belongs to. */
  factionId: string;
  /**
   * Short greeting / flavour dialogue shown when the player first talks to
   * this NPC. Keep to 1–2 sentences.
   */
  dialogueGreeting: string;
  /**
   * Dialogue shown when the player declines a mission or has none available.
   */
  dialogueIdle: string;
  /**
   * Mission ids this NPC offers, in priority order (first available is shown
   * first). The MissionRegistry holds the full spec for each.
   */
  missionIds: string[];
  /** Visual role hint used by the renderer to pick the right portrait sprite. */
  role: "commander" | "trader" | "emissary" | "archivist" | "broker" | "captain"
      | "chief" | "scrapper" | "foreman" | "geologist" | "insurgent" | "strategist";
}

// ── Terran Federation NPCs ────────────────────────────────────────────────────

const COMMANDER_VOSS: NPCDefinition = {
  id: "npc-commander-voss",
  name: "Commander Voss",
  factionId: "terran-federation",
  dialogueGreeting:
    "Pilot. The Federation has work for capable hands — and good pay. Are you interested?",
  dialogueIdle:
    "Dismissed for now. Check back when you've proven yourself out there.",
  missionIds: [
    "mission-tf-courier-alpha",
    "mission-tf-patrol-dispatch",
    "mission-tf-explore-mars",
    "mission-tf-kill-pirates",
    "mission-tf-away-patrol",
  ],
  role: "commander",
};

const TRADER_HALLEY: NPCDefinition = {
  id: "npc-trader-halley",
  name: "Halley",
  factionId: "terran-federation",
  dialogueGreeting:
    "Welcome to the Federation market post. I deal in alloys and honest coin.",
  dialogueIdle:
    "Come back when the markets shift — I'll have fresh deals then.",
  missionIds: ["mission-tf-trade-alloys"],
  role: "trader",
};

// ── Xeno Collective NPCs ──────────────────────────────────────────────────────

const EMISSARY_ZYX: NPCDefinition = {
  id: "npc-emissary-zyx",
  name: "Emissary Zyx",
  factionId: "xeno-collective",
  dialogueGreeting:
    "You interest us, traveller. The Collective observes... and sometimes requests.",
  dialogueIdle:
    "Patience. The Collective will reach out when the need arises.",
  missionIds: [
    "mission-xc-courier-nexus",
    "mission-xc-trade-crystals",
  ],
  role: "emissary",
};

const ARCHIVIST_KRELL: NPCDefinition = {
  id: "npc-archivist-krell",
  name: "Archivist Krell",
  factionId: "xeno-collective",
  dialogueGreeting:
    "Our records require expanding. You will bring us what we need.",
  dialogueIdle: "Return when you have gathered the requested samples.",
  missionIds: ["mission-xc-trade-exotic"],
  role: "archivist",
};

// ── Void Merchants Guild NPCs ─────────────────────────────────────────────────

const BROKER_SABLE: NPCDefinition = {
  id: "npc-broker-sable",
  name: "Broker Sable",
  factionId: "void-merchants",
  dialogueGreeting:
    "Credits talk, pilot. I have routes that need running — interested?",
  dialogueIdle:
    "No gold, no job. Come back when you're ready to earn.",
  missionIds: [
    "mission-vm-courier-hub",
    "mission-vm-courier-beta",
  ],
  role: "broker",
};

const CAPTAIN_MIRA: NPCDefinition = {
  id: "npc-captain-mira",
  name: "Captain Mira",
  factionId: "void-merchants",
  dialogueGreeting:
    "Good to see you. My convoy could use an extra escort — pays well.",
  dialogueIdle: "I'll signal you when the next convoy is ready to move.",
  missionIds: ["mission-vm-trade-alloys"],
  role: "captain",
};

// ── Scavenger Clans NPCs ──────────────────────────────────────────────────────

const CHIEF_RASK: NPCDefinition = {
  id: "npc-chief-rask",
  name: "Chief Rask",
  factionId: "scavenger-clans",
  dialogueGreeting:
    "You're either brave or stupid coming here. Could use either — you bringing goods?",
  dialogueIdle: "Don't waste my time unless you've got something worth trading.",
  missionIds: [
    "mission-sc-courier-salvage",
    "mission-sc-trade-parts",
    "mission-sc-kill-rivals",
  ],
  role: "chief",
};

const SCRAPPER_DEX: NPCDefinition = {
  id: "npc-scrapper-dex",
  name: "Scrapper Dex",
  factionId: "scavenger-clans",
  dialogueGreeting:
    "Word is you're looking for work? I can always use a runner who won't ask questions.",
  dialogueIdle: "Keep your head down. I'll have a job for you soon.",
  missionIds: ["mission-sc-trade-crystals"],
  role: "scrapper",
};

// ── Deep Miners Collective NPCs ───────────────────────────────────────────────

const FOREMAN_GROTH: NPCDefinition = {
  id: "npc-foreman-groth",
  name: "Foreman Groth",
  factionId: "deep-miners",
  dialogueGreeting:
    "We're shorthanded on delivery routes. Pays in credits and alloys — interested?",
  dialogueIdle:
    "The drills keep running. Talk to me when you've got capacity to haul.",
  missionIds: [
    "mission-dm-courier-gamma",
    "mission-dm-trade-alloys",
    "mission-dm-explore-station",
  ],
  role: "foreman",
};

const GEOLOGIST_PERA: NPCDefinition = {
  id: "npc-geologist-pera",
  name: "Geologist Pera",
  factionId: "deep-miners",
  dialogueGreeting:
    "My survey drones found exotic readings near the outer belt. Help me retrieve the data?",
  dialogueIdle:
    "Still processing the last batch. Come back after your next run.",
  missionIds: ["mission-dm-courier-survey"],
  role: "geologist",
};

// ── Nova Rebels NPCs ──────────────────────────────────────────────────────────

const INSURGENT_TYNE: NPCDefinition = {
  id: "npc-insurgent-tyne",
  name: "Tyne",
  factionId: "nova-rebels",
  dialogueGreeting:
    "Every supply run is a strike against the Federation's stranglehold. Are you with us?",
  dialogueIdle:
    "Stay sharp. The next operation is almost ready.",
  missionIds: [
    "mission-nr-courier-rebel",
    "mission-nr-trade-crystals",
  ],
  role: "insurgent",
};

const STRATEGIST_ORION: NPCDefinition = {
  id: "npc-strategist-orion",
  name: "Strategist Orion",
  factionId: "nova-rebels",
  dialogueGreeting:
    "We need materials to build, not just fight. Bring me what's on this list.",
  dialogueIdle:
    "The revolution waits for no one — but I'll wait for you.",
  missionIds: ["mission-nr-trade-exotic", "mission-nr-assault-base"],
  role: "strategist",
};

// ── Registry ──────────────────────────────────────────────────────────────────

const ALL_NPCS: readonly NPCDefinition[] = Object.freeze([
  COMMANDER_VOSS,
  TRADER_HALLEY,
  EMISSARY_ZYX,
  ARCHIVIST_KRELL,
  BROKER_SABLE,
  CAPTAIN_MIRA,
  CHIEF_RASK,
  SCRAPPER_DEX,
  FOREMAN_GROTH,
  GEOLOGIST_PERA,
  INSURGENT_TYNE,
  STRATEGIST_ORION,
]);

const NPC_MAP: Readonly<Record<string, NPCDefinition>> = Object.freeze(
  Object.fromEntries(ALL_NPCS.map((n) => [n.id, n])),
);

// ── Public API ─────────────────────────────────────────────────────────────────

export const NPCRegistry = {
  /**
   * Returns the NPC definition for the given id, or `undefined` if unknown.
   */
  getNPC(id: string): NPCDefinition | undefined {
    return NPC_MAP[id];
  },

  /**
   * Returns every NPC definition.
   */
  getAllNPCs(): readonly NPCDefinition[] {
    return ALL_NPCS;
  },

  /**
   * Returns all NPC ids.
   */
  getAllNPCIds(): string[] {
    return ALL_NPCS.map((n) => n.id);
  },

  /**
   * Returns all NPCs belonging to the given faction.
   */
  getNPCsByFaction(factionId: string): NPCDefinition[] {
    return ALL_NPCS.filter((n) => n.factionId === factionId);
  },

  /**
   * Returns the first NPC that offers the given mission id, or `undefined`.
   */
  getNPCForMission(missionId: string): NPCDefinition | undefined {
    return ALL_NPCS.find((n) => n.missionIds.includes(missionId));
  },
} as const;
