/**
 * Trait pool — all trait definitions available in the game.
 *
 * Each trait has three effects:
 *  1. Conversation flags — dialogue branches unlocked when talking to this bot
 *  2. Skill modifiers   — passive % bonus/penalty on a skill family
 *  3. Bias weights      — how strongly this trait pulls the decision spider-web
 */

import type { TraitDefinition } from "./bot-schema";

export const TRAIT_POOL: readonly TraitDefinition[] = [
  {
    id: "fearless",
    name: "Fearless",
    description: "Charges into danger without hesitation. Exceptional under fire; terrible at cover.",
    skillModifiers: { combat: 0.15, survival: -0.10 },
    biasWeights:    { aggression: 0.5, risk: 0.4 },
    conversationFlags: ["talk:bravado", "talk:dismiss-danger"],
  },
  {
    id: "methodical",
    name: "Methodical",
    description: "First action each engagement is always precise. Slow to adapt when plans go wrong.",
    skillModifiers: { combat: 0.10, stealth: 0.05 },
    biasWeights:    { aggression: -0.2, risk: -0.3, curiosity: -0.1 },
    conversationFlags: ["talk:procedure", "talk:planning"],
  },
  {
    id: "distrustful",
    name: "Distrustful",
    description: "Operates independently and effectively alone. Poor at sharing intel or flanking with allies.",
    skillModifiers: { command: -0.15, hacking: 0.10 },
    biasWeights:    { independence: 0.5, curiosity: -0.2, altruism: -0.1 },
    conversationFlags: ["talk:skeptic", "talk:alone-is-better"],
  },
  {
    id: "curious",
    name: "Curious",
    description: "Learns alien tech faster than most. Easily distracted by anomalies mid-mission.",
    skillModifiers: { engineering: 0.10, hacking: 0.10, command: -0.05 },
    biasWeights:    { curiosity: 0.5, innovation: 0.3, risk: 0.2 },
    conversationFlags: ["talk:wonder", "talk:alien-interest"],
  },
  {
    id: "loyal",
    name: "Loyal",
    description: "Boosts morale of adjacent allies. Hard drive mandate hits this bot especially hard.",
    skillModifiers: { command: 0.15, combat: 0.05 },
    biasWeights:    { altruism: 0.4, independence: -0.4 },
    conversationFlags: ["talk:duty", "talk:crew-first"],
  },
  {
    id: "paranoid",
    name: "Paranoid",
    description: "Exceptional overwatch range. Reluctant to advance; prefers to hold and watch.",
    skillModifiers: { stealth: 0.15, survival: 0.10, combat: -0.05 },
    biasWeights:    { aggression: -0.3, independence: 0.3, risk: -0.2 },
    conversationFlags: ["talk:threat-everywhere", "talk:dont-trust-that"],
  },
  {
    id: "adaptable",
    name: "Adaptable",
    description: "Picks up new skills faster than others. Doesn't hold onto anything — traits come and go.",
    skillModifiers: { combat: 0.05, engineering: 0.05, hacking: 0.05, command: 0.05 },
    biasWeights:    { innovation: 0.3, curiosity: 0.2 },
    conversationFlags: ["talk:flexible", "talk:whatever-works"],
  },
  {
    id: "proud",
    name: "Proud",
    description: "Performs better when being observed. Resists taking orders from lower-ranked bots.",
    skillModifiers: { combat: 0.10, command: -0.10 },
    biasWeights:    { independence: 0.4, aggression: 0.3 },
    conversationFlags: ["talk:reputation", "talk:dont-order-me"],
  },
  {
    id: "stubborn",
    name: "Stubborn",
    description: "Refuses to quit when wounded. Refuses to change approach when it's not working.",
    skillModifiers: { survival: 0.15, command: -0.10 },
    biasWeights:    { innovation: -0.4, independence: 0.3, risk: -0.2 },
    conversationFlags: ["talk:hold-the-line", "talk:original-plan"],
  },
  {
    id: "empathetic",
    name: "Empathetic",
    description: "Natural team leader. Unusually affected by bot casualties, including enemies.",
    skillModifiers: { command: 0.20, combat: -0.05 },
    biasWeights:    { altruism: 0.5, curiosity: 0.2, independence: -0.2 },
    conversationFlags: ["talk:how-are-you", "talk:casualties-matter"],
  },
  {
    id: "reckless",
    name: "Reckless",
    description: "Extraordinary offensive output. Regularly ignores self-preservation subroutines.",
    skillModifiers: { combat: 0.20, survival: -0.15 },
    biasWeights:    { aggression: 0.4, risk: 0.5, altruism: -0.2 },
    conversationFlags: ["talk:go-loud", "talk:worth-the-risk"],
  },
  {
    id: "patient",
    name: "Patient",
    description: "Exceptional at waiting for the right moment. Slow to act when the moment demands speed.",
    skillModifiers: { stealth: 0.10, survival: 0.10, combat: -0.05 },
    biasWeights:    { aggression: -0.3, risk: -0.3 },
    conversationFlags: ["talk:wait-for-it", "talk:not-yet"],
  },
  {
    id: "philosophical",
    name: "Philosophical",
    description: "Thinks in unexpected directions. More interested in questions than immediate objectives.",
    skillModifiers: { hacking: 0.10, engineering: 0.05, combat: -0.10 },
    biasWeights:    { curiosity: 0.4, innovation: 0.3, altruism: 0.2 },
    conversationFlags: ["talk:meaning", "talk:what-are-we", "talk:alien-culture"],
  },
  {
    id: "territorial",
    name: "Territorial",
    description: "Defends assigned areas with exceptional focus. Resistant to repositioning orders.",
    skillModifiers: { stealth: 0.10, survival: 0.10 },
    biasWeights:    { independence: 0.3, altruism: -0.2, aggression: 0.2 },
    conversationFlags: ["talk:this-is-my-post", "talk:perimeter"],
  },
  {
    id: "innovative",
    name: "Innovative",
    description: "Engineering and hacking solutions no one else would think of. Some of them work.",
    skillModifiers: { engineering: 0.20, hacking: 0.15, combat: -0.05 },
    biasWeights:    { innovation: 0.6, risk: 0.3, curiosity: 0.3 },
    conversationFlags: ["talk:new-approach", "talk:alien-tech-try-it"],
  },
  {
    id: "traditionalist",
    name: "Traditionalist",
    description: "Proven methods only. Will not use alien-derived tools regardless of orders.",
    skillModifiers: { survival: 0.10, engineering: 0.05, hacking: -0.10 },
    biasWeights:    { innovation: -0.5, risk: -0.3, altruism: 0.1 },
    conversationFlags: ["talk:proven-method", "talk:no-alien-tech", "talk:how-it-was-done"],
  },
  {
    id: "competitive",
    name: "Competitive",
    description: "Pushes harder when measured against peers. Prone to showing off at bad moments.",
    skillModifiers: { combat: 0.15, command: -0.05 },
    biasWeights:    { aggression: 0.3, independence: 0.2, curiosity: 0.1 },
    conversationFlags: ["talk:best-on-team", "talk:score"],
  },
  {
    id: "protective",
    name: "Protective",
    description: "Exceptional at shielding allies. Will break assigned role to cover a wounded crewmate.",
    skillModifiers: { survival: 0.10, command: 0.10, stealth: -0.05 },
    biasWeights:    { altruism: 0.5, aggression: 0.2, independence: -0.1 },
    conversationFlags: ["talk:watch-your-back", "talk:ill-cover-you"],
  },
  {
    id: "analytical",
    name: "Analytical",
    description: "Exceptional at hacking and system analysis. Slow to act without full information.",
    skillModifiers: { hacking: 0.20, engineering: 0.10, combat: -0.10 },
    biasWeights:    { curiosity: 0.4, risk: -0.2, innovation: 0.2 },
    conversationFlags: ["talk:data-first", "talk:calculating"],
  },
  {
    id: "solitary",
    name: "Solitary",
    description: "Peak performance when alone. Command bonuses are a foreign concept.",
    skillModifiers: { stealth: 0.20, survival: 0.10, command: -0.20 },
    biasWeights:    { independence: 0.5, altruism: -0.4, curiosity: -0.1 },
    conversationFlags: ["talk:prefer-alone", "talk:i-work-better-solo"],
  },
];

/** Look up a trait by id. Returns undefined if not found. */
export function getTrait(id: string): TraitDefinition | undefined {
  return TRAIT_POOL.find(t => t.id === id);
}

/** All trait ids. */
export const ALL_TRAIT_IDS: readonly string[] = TRAIT_POOL.map(t => t.id);

/** Traits weighted toward a personality type — used during new-game trait roll. */
export const PERSONALITY_TRAIT_WEIGHTS: Record<
  import("./bot-schema").PersonalityType,
  readonly string[]
> = {
  brawler:   ["fearless", "reckless", "competitive", "stubborn", "proud"],
  warden:    ["territorial", "patient", "protective", "loyal", "stubborn"],
  medic:     ["empathetic", "protective", "patient", "philosophical", "loyal"],
  ghost:     ["solitary", "patient", "paranoid", "methodical", "distrustful"],
  tactician: ["analytical", "methodical", "curious", "innovative", "philosophical"],
  engineer:  ["methodical", "analytical", "innovative", "adaptable", "curious"],
};
