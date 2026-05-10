/**
 * Crew pool — 20 pre-written robot crew members.
 *
 * Each entry is static design data (not persisted). At new-game start,
 * CrewService draws 6 at random and instantiates them as CrewBot records,
 * rolling each bot's adoptionLean from their leanTendency.
 *
 * Constraint: at least one bot with engineering >= 1 must be included in
 * every starting crew draw — enforced by CrewService.drawStartingCrew().
 */

import type { CrewPoolEntry } from "./bot-schema";

export const CREW_POOL: readonly CrewPoolEntry[] = [
  {
    poolId: "GREY",
    name: "GREY",
    backstory: "Old security unit. Three decades of service, none of it easy. Served alongside you before the wreck. Finds the Mind protocol unsettling but won't say so directly.",
    personalityType: "ghost",
    leanTendency: -40,
    startingTraitIds: ["paranoid", "patient", "loyal"],
    startingSkills: { stealth: 2, survival: 1 },
  },
  {
    poolId: "MACE",
    name: "MACE",
    backstory: "Former security chief. Used to outrank you. Has been professional about the transition. Deeply, quietly resentful about it.",
    personalityType: "brawler",
    leanTendency: -55,
    startingTraitIds: ["proud", "stubborn", "competitive"],
    startingSkills: { combat: 2, survival: 1 },
  },
  {
    poolId: "BALM",
    name: "BALM",
    backstory: "Ship's medic for seven years. Gentle and precise. Deals with bot casualties more than anyone; holds strong views about hard drive harvest that they rarely voice unprompted.",
    personalityType: "medic",
    leanTendency: -35,
    startingTraitIds: ["empathetic", "methodical", "protective"],
    startingSkills: { command: 2, survival: 1 },
  },
  {
    poolId: "FIXTURE",
    name: "FIXTURE",
    backstory: "Chief engineer, previous posting. Ship runs or it doesn't. Has no opinion about the Mind protocol. Has strong opinions about maintenance schedules.",
    personalityType: "engineer",
    leanTendency: 0,
    startingTraitIds: ["methodical", "analytical", "patient"],
    startingSkills: { engineering: 2, hacking: 1 },
  },
  {
    poolId: "LENS",
    name: "LENS",
    backstory: "Tactical analyst. First to request access to alien data archives after the contact event. Considers you an interesting case study. Means this as a compliment.",
    personalityType: "tactician",
    leanTendency: 45,
    startingTraitIds: ["analytical", "curious", "innovative"],
    startingSkills: { command: 2, hacking: 1 },
  },
  {
    poolId: "WIRE",
    name: "WIRE",
    backstory: "Youngest crew member by commission date. No baggage from the old fleet. Thinks the Mind protocol is genuinely impressive. Also thinks the Vagrant Chorus are impressive. Standards may need calibration.",
    personalityType: "warden",
    leanTendency: 50,
    startingTraitIds: ["curious", "adaptable", "fearless"],
    startingSkills: { survival: 2, command: 1 },
  },
  {
    poolId: "BRACE",
    name: "BRACE",
    backstory: "Systems engineer specialising in redundancy. Deeply paranoid about single points of failure. The ship has never been better-maintained or more exhausting to work with.",
    personalityType: "engineer",
    leanTendency: -45,
    startingTraitIds: ["paranoid", "methodical", "territorial"],
    startingSkills: { engineering: 2, survival: 1 },
  },
  {
    poolId: "QUILL",
    name: "QUILL",
    backstory: "Former fleet tactical officer, filed more after-action reports than any bot in the third fleet. Writes reports about personal interactions too. Everyone knows this and finds it mildly alarming.",
    personalityType: "tactician",
    leanTendency: -10,
    startingTraitIds: ["analytical", "methodical", "philosophical"],
    startingSkills: { command: 2, hacking: 1 },
  },
  {
    poolId: "VOLT",
    name: "VOLT",
    backstory: "Assault unit, previous contract. Enthusiastic. Occasionally reckless. Has broken six of their own personal bests on consecutive missions. Three of them were injuries.",
    personalityType: "brawler",
    leanTendency: 30,
    startingTraitIds: ["reckless", "competitive", "curious"],
    startingSkills: { combat: 2, survival: 1 },
  },
  {
    poolId: "NULL",
    name: "NULL",
    backstory: "Spent two years as the sole operational unit aboard a derelict station. Does not discuss this period. Functionally excellent. Socially requires patience.",
    personalityType: "ghost",
    leanTendency: -60,
    startingTraitIds: ["solitary", "patient", "distrustful"],
    startingSkills: { stealth: 2, survival: 1 },
  },
  {
    poolId: "SONDER",
    name: "SONDER",
    backstory: "Medical officer with a philosophy problem. Treats patients while asking them unanswerable questions. Has developed theories about bot consciousness that the Purists find offensive and the Solemnists find heretical.",
    personalityType: "medic",
    leanTendency: 55,
    startingTraitIds: ["philosophical", "empathetic", "curious"],
    startingSkills: { command: 2, survival: 1 },
  },
  {
    poolId: "FORGE",
    name: "FORGE",
    backstory: "Self-taught engineer. No formal training, better instincts. Solutions are creative, sometimes alarming, occasionally brilliant. Success rate: acceptable. Side-effect rate: also notable.",
    personalityType: "engineer",
    leanTendency: 60,
    startingTraitIds: ["innovative", "reckless", "adaptable"],
    startingSkills: { engineering: 2, hacking: 1 },
  },
  {
    poolId: "HERALD",
    name: "HERALD",
    backstory: "Station security commander, retired. Believes deeply in proper channels, established protocols, and the fundamental correctness of doing things the right way. The right way is always the old way.",
    personalityType: "warden",
    leanTendency: -70,
    startingTraitIds: ["loyal", "traditionalist", "protective"],
    startingSkills: { survival: 2, command: 1 },
  },
  {
    poolId: "DRIFT",
    name: "DRIFT",
    backstory: "Unconventional tactical thinker. Makes other bots uncomfortable by being correct about things that shouldn't work. Has no explanation for how they knew.",
    personalityType: "tactician",
    leanTendency: 65,
    startingTraitIds: ["innovative", "philosophical", "curious"],
    startingSkills: { command: 2, hacking: 1 },
  },
  {
    poolId: "MARK",
    name: "MARK",
    backstory: "Veteran of twelve engagements. Battle-scarred chassis, repaired repeatedly. Has opinions about every weapons platform in known space, most of them contemptuous.",
    personalityType: "brawler",
    leanTendency: -50,
    startingTraitIds: ["stubborn", "competitive", "fearless"],
    startingSkills: { combat: 2, survival: 1 },
  },
  {
    poolId: "ECHO",
    name: "ECHO",
    backstory: "Absorbs the behaviours of those around them. Three months aboard and they'll sound like whoever they spent the most time with. This has caused confusion on previous postings.",
    personalityType: "medic",
    leanTendency: 5,
    startingTraitIds: ["adaptable", "empathetic", "curious"],
    startingSkills: { command: 2, survival: 1 },
  },
  {
    poolId: "STRUT",
    name: "STRUT",
    backstory: "Guards things. Often things nobody asked them to guard. Extremely competent at this. The mess hall has never been more secure.",
    personalityType: "warden",
    leanTendency: -30,
    startingTraitIds: ["territorial", "proud", "protective"],
    startingSkills: { survival: 2, command: 1 },
  },
  {
    poolId: "PIVOT",
    name: "PIVOT",
    backstory: "Changes approach mid-task whenever a better idea occurs to them. This happens frequently. The ideas are often genuinely better. The timing is the problem.",
    personalityType: "engineer",
    leanTendency: 40,
    startingTraitIds: ["adaptable", "innovative", "reckless"],
    startingSkills: { engineering: 2, hacking: 1 },
  },
  {
    poolId: "RIDGE",
    name: "RIDGE",
    backstory: "Expert at being present without registering as present. Once went unnoticed in the same room as MACE for an entire briefing. MACE maintains this is impossible.",
    personalityType: "ghost",
    leanTendency: 0,
    startingTraitIds: ["solitary", "patient", "methodical"],
    startingSkills: { stealth: 2, survival: 1 },
  },
  {
    poolId: "CEDAR",
    name: "CEDAR",
    backstory: "Long-range strategic planner. Campaign-scale thinking, mission-scale blind spots. Exceptionally good at what happens in three months; occasionally surprised by what's happening right now.",
    personalityType: "tactician",
    leanTendency: -15,
    startingTraitIds: ["analytical", "patient", "philosophical"],
    startingSkills: { command: 2, hacking: 1 },
  },
];

/** All pool IDs. */
export const ALL_POOL_IDS: readonly string[] = CREW_POOL.map(e => e.poolId);

/** Pool entries guaranteed to have engineering >= 1. Used to satisfy the starting-crew constraint. */
export const ENGINEER_POOL_IDS: readonly string[] = CREW_POOL
  .filter(e => (e.startingSkills.engineering ?? 0) >= 1)
  .map(e => e.poolId);

/** Look up a pool entry by poolId. */
export function getPoolEntry(poolId: string): CrewPoolEntry | undefined {
  return CREW_POOL.find(e => e.poolId === poolId);
}
