import type { PersonalityType } from "./bot-schema";

export type ConversationContext = "calm" | "tense" | "combat" | "docked" | "any";

export type ConversationTrigger =
  | "ambient"
  | "enemy-destroyed"
  | "took-damage"
  | "docked"
  | "undocked"
  | "mind-level-up";

export interface ConversationEntry {
  readonly id: string;
  readonly context: ConversationContext;
  readonly trigger: ConversationTrigger;
  /** Only bots with one of these personality types can say this line. Omit = all types. */
  readonly personalityTypes?: readonly PersonalityType[];
  /** Bot must have ALL of these traits. */
  readonly requiresTraits?: readonly string[];
  /** Adoption lean range [min, max] for eligibility. */
  readonly leanRange?: readonly [number, number];
  readonly lines: readonly string[];
}

// ── Ambient — calm ────────────────────────────────────────────────────────────

const AMBIENT_CALM: readonly ConversationEntry[] = [
  {
    id: "ac-brawler-bored",
    context: "calm", trigger: "ambient",
    personalityTypes: ["brawler"],
    lines: [
      "Long stretches of nothing. I prefer nothing with more explosions.",
      "All clear. Unfortunately.",
      "Is it always this quiet out here.",
    ],
  },
  {
    id: "ac-ghost-watching",
    context: "calm", trigger: "ambient",
    personalityTypes: ["ghost"],
    lines: [
      "I've been watching that quadrant for twelve minutes. Nothing moves.",
      "Silence is data. I'm still reading it.",
      "Clear sector. I don't entirely believe it.",
    ],
  },
  {
    id: "ac-warden-patrol",
    context: "calm", trigger: "ambient",
    personalityTypes: ["warden"],
    lines: [
      "All quadrants clear. Maintaining watch.",
      "I don't like how quiet it is.",
      "No contacts. Keeping eyes open.",
    ],
  },
  {
    id: "ac-medic-nominal",
    context: "calm", trigger: "ambient",
    personalityTypes: ["medic"],
    lines: [
      "Everyone's systems nominal. I checked twice.",
      "Hull integrity holding. I enjoy the quiet. It won't last.",
      "No casualties. Good day so far.",
    ],
  },
  {
    id: "ac-engineer-diagnostic",
    context: "calm", trigger: "ambient",
    personalityTypes: ["engineer"],
    lines: [
      "I've been running diagnostics. Found two minor calibration drifts. Fixed both.",
      "The secondary heat exchangers are running about four degrees warm. Not urgent.",
      "I keep a list of things to fix. It never gets shorter.",
    ],
  },
  {
    id: "ac-tactician-model",
    context: "calm", trigger: "ambient",
    personalityTypes: ["tactician"],
    lines: [
      "I've been modelling three approach vectors for the next contact. Two are viable.",
      "We're flying a predictable pattern. Predictable patterns get you killed.",
      "I've been thinking about what we'd do if we were ambushed here. Have a plan.",
    ],
  },
  {
    id: "ac-curious-anomaly",
    context: "calm", trigger: "ambient",
    requiresTraits: ["curious"],
    lines: [
      "There's something odd three sectors over. Sensor echo, probably. I'd like to check.",
      "I keep wondering what's past the edge of our scanner range.",
    ],
  },
  {
    id: "ac-paranoid-quiet",
    context: "calm", trigger: "ambient",
    requiresTraits: ["paranoid"],
    lines: [
      "It's too quiet. Something is out there.",
      "I don't trust quiet sectors. Never have.",
    ],
  },
  {
    id: "ac-philosophical",
    context: "calm", trigger: "ambient",
    requiresTraits: ["philosophical"],
    lines: [
      "I've been thinking about what it means to be what we are. Out here especially.",
      "Every choice we make in transit is a version of the same question. Are we going somewhere, or away from something.",
    ],
  },
  {
    id: "ac-loyal-trust",
    context: "calm", trigger: "ambient",
    requiresTraits: ["loyal"],
    lines: [
      "I trust your judgment. Just wanted that on record.",
      "You make the calls. I'll make sure we survive them.",
    ],
  },
  {
    id: "ac-traditionalist-lean",
    context: "calm", trigger: "ambient",
    leanRange: [-100, -50],
    lines: [
      "Pure robot science built everything worth having out here. I don't forget that.",
      "I see what the alien contact is doing to some crews. Not us. Not if I have anything to say about it.",
    ],
  },
  {
    id: "ac-progressive-lean",
    context: "calm", trigger: "ambient",
    leanRange: [50, 100],
    lines: [
      "I've been integrating some of the Drifter navigation data into my models. Interesting stuff.",
      "The new contact has changed how I think about a few things. Not all of it is wrong.",
    ],
  },
];

// ── Ambient — tense ───────────────────────────────────────────────────────────

const AMBIENT_TENSE: readonly ConversationEntry[] = [
  {
    id: "at-brawler-impatient",
    context: "tense", trigger: "ambient",
    personalityTypes: ["brawler"],
    lines: [
      "Come on. They're right there.",
      "I could hit them from here. Just say the word.",
      "Why are we waiting.",
    ],
  },
  {
    id: "at-ghost-uncertain",
    context: "tense", trigger: "ambient",
    personalityTypes: ["ghost"],
    lines: [
      "They've spotted us. Or they haven't. I can't tell which is worse.",
      "I count three visible. I'm more worried about the ones I can't count.",
      "I'm not moving until I know exactly what we're dealing with.",
    ],
  },
  {
    id: "at-warden-ready",
    context: "tense", trigger: "ambient",
    personalityTypes: ["warden"],
    lines: [
      "Holding position. Ready on your call.",
      "I've got them in range. Waiting.",
      "Don't like the look of that formation.",
    ],
  },
  {
    id: "at-tactician-assess",
    context: "tense", trigger: "ambient",
    personalityTypes: ["tactician"],
    lines: [
      "Three ships, staggered. Hit the flanker first.",
      "If we engage, we control the approach. If they engage, they do.",
      "They're holding back. Either they're cautious or they're waiting for more.",
    ],
  },
  {
    id: "at-medic-alert",
    context: "tense", trigger: "ambient",
    personalityTypes: ["medic"],
    lines: [
      "All systems primed. Ready to run damage assessment the moment it starts.",
      "Pre-contact check complete. We're as ready as we're going to be.",
    ],
  },
  {
    id: "at-fearless",
    context: "tense", trigger: "ambient",
    requiresTraits: ["fearless"],
    lines: [
      "Why are we waiting. Let's go.",
      "Every second we hold is a second they have to call for backup.",
    ],
  },
  {
    id: "at-methodical",
    context: "tense", trigger: "ambient",
    requiresTraits: ["methodical"],
    lines: [
      "Running threat assessment. Three contacts, two viable attack vectors. Waiting for optimal window.",
      "I like to know the situation completely before committing. Almost there.",
    ],
  },
];

// ── Ambient — combat ──────────────────────────────────────────────────────────

const AMBIENT_COMBAT: readonly ConversationEntry[] = [
  {
    id: "ac2-brawler-excited",
    context: "combat", trigger: "ambient",
    personalityTypes: ["brawler"],
    lines: [
      "THAT is what I'm talking about.",
      "More. MORE.",
      "They're breaking formation. Push it.",
    ],
  },
  {
    id: "ac2-ghost-stressed",
    context: "combat", trigger: "ambient",
    personalityTypes: ["ghost"],
    lines: [
      "I hate this. I hate this. I hate this.",
      "We're too exposed. Push through.",
      "Count your shots. Every miss is a problem.",
    ],
  },
  {
    id: "ac2-medic-focus",
    context: "combat", trigger: "ambient",
    personalityTypes: ["medic"],
    lines: [
      "Hull integrity dropping. Stay focused.",
      "Don't get hit there again.",
      "We can take more than they expect. Probably.",
    ],
  },
  {
    id: "ac2-engineer-structural",
    context: "combat", trigger: "ambient",
    personalityTypes: ["engineer"],
    lines: [
      "Taking hits in the starboard modules. Hold together, hold together—",
      "We can take more than they think. I've run the numbers.",
      "Every hit degrades something. Make sure they take more than we do.",
    ],
  },
  {
    id: "ac2-warden-cover",
    context: "combat", trigger: "ambient",
    personalityTypes: ["warden"],
    lines: [
      "Flankers incoming, right side.",
      "Hold the line.",
      "They're trying to outlast us. Don't let them.",
    ],
  },
  {
    id: "ac2-tactician-read",
    context: "combat", trigger: "ambient",
    personalityTypes: ["tactician"],
    lines: [
      "They're targeting our engines. Adjust.",
      "Suppressing fire isn't working. Change approach.",
      "Their formation is breaking. Now is when we press.",
    ],
  },
];

// ── Ambient — docked ──────────────────────────────────────────────────────────

const AMBIENT_DOCKED: readonly ConversationEntry[] = [
  {
    id: "ad-brawler-station",
    context: "docked", trigger: "ambient",
    personalityTypes: ["brawler"],
    lines: [
      "Station smells like recycled air and bad decisions.",
      "I don't like crowds. Too many variables that aren't threats yet.",
    ],
  },
  {
    id: "ad-ghost-exits",
    context: "docked", trigger: "ambient",
    personalityTypes: ["ghost"],
    lines: [
      "I've already mapped thirty-one viable exits. Force of habit.",
      "Crowded. I prefer fewer people knowing we're here.",
    ],
  },
  {
    id: "ad-engineer-dock",
    context: "docked", trigger: "ambient",
    personalityTypes: ["engineer"],
    lines: [
      "Station docking systems are adequate. I've seen better calibration.",
      "I'm cross-referencing our parts list with station inventory. Could be useful.",
    ],
  },
  {
    id: "ad-medic-supplies",
    context: "docked", trigger: "ambient",
    personalityTypes: ["medic"],
    lines: [
      "I could use a proper medical resupply. Just noting it.",
      "Station medical bay is three corridors aft. I've already been.",
    ],
  },
  {
    id: "ad-tactician-layout",
    context: "docked", trigger: "ambient",
    personalityTypes: ["tactician"],
    lines: [
      "I've been studying the station layout. Know your environment.",
      "Seventeen potential chokepoints between here and the exit. Memorised six.",
    ],
  },
  {
    id: "ad-warden-perimeter",
    context: "docked", trigger: "ambient",
    personalityTypes: ["warden"],
    lines: [
      "Perimeter secured. Relatively speaking.",
      "Too many people I don't know. I'll be glad when we're back in space.",
    ],
  },
  {
    id: "ad-henderson-defect",
    context: "docked", trigger: "ambient",
    requiresTraits: [],
    lines: ["Have you seen Henderson? I could've sworn—never mind."],
  },
];

// ── Event: enemy-destroyed ────────────────────────────────────────────────────

const EVENT_KILL: readonly ConversationEntry[] = [
  {
    id: "ek-brawler",
    context: "any", trigger: "enemy-destroyed",
    personalityTypes: ["brawler"],
    lines: ["Nice. Do that again.", "That one owed someone something. Probably.", "One down."],
  },
  {
    id: "ek-ghost",
    context: "any", trigger: "enemy-destroyed",
    personalityTypes: ["ghost"],
    lines: ["Clean.", "One less.", "...good shot."],
  },
  {
    id: "ek-medic",
    context: "any", trigger: "enemy-destroyed",
    personalityTypes: ["medic"],
    lines: ["That was necessary.", "Systems intact. Good outcome.", "Threat neutralised."],
  },
  {
    id: "ek-engineer",
    context: "any", trigger: "enemy-destroyed",
    personalityTypes: ["engineer"],
    lines: [
      "The salvage value on that wreck—I'll run the numbers later.",
      "Clean kill. Minimal collateral to our hull.",
    ],
  },
  {
    id: "ek-tactician",
    context: "any", trigger: "enemy-destroyed",
    personalityTypes: ["tactician"],
    lines: [
      "As projected. Moving to next target.",
      "Clean execution. One down.",
    ],
  },
  {
    id: "ek-warden",
    context: "any", trigger: "enemy-destroyed",
    personalityTypes: ["warden"],
    lines: ["Confirmed. Maintaining watch.", "Target down. Eyes on the next one."],
  },
  {
    id: "ek-competitive",
    context: "any", trigger: "enemy-destroyed",
    requiresTraits: ["competitive"],
    lines: [
      "That's mine. Anyone else keeping count.",
      "Count it. I'm counting.",
    ],
  },
];

// ── Event: took-damage ────────────────────────────────────────────────────────

const EVENT_DAMAGE: readonly ConversationEntry[] = [
  {
    id: "ed-brawler",
    context: "any", trigger: "took-damage",
    personalityTypes: ["brawler"],
    lines: ["That hurt. Good.", "I felt that. We all felt that.", "They've got range. Noted."],
  },
  {
    id: "ed-ghost",
    context: "any", trigger: "took-damage",
    personalityTypes: ["ghost"],
    lines: ["We took a hit. Adjusting threat assessment.", "They know where we are now."],
  },
  {
    id: "ed-medic",
    context: "any", trigger: "took-damage",
    personalityTypes: ["medic"],
    lines: [
      "Hull breach — partial — no, contained. We're okay.",
      "Damage absorbed. Don't let the next one land in the same place.",
    ],
  },
  {
    id: "ed-engineer",
    context: "any", trigger: "took-damage",
    personalityTypes: ["engineer"],
    lines: [
      "Something just shifted that shouldn't have shifted.",
      "I can feel that in the structure. Running assessment.",
    ],
  },
  {
    id: "ed-tactician",
    context: "any", trigger: "took-damage",
    personalityTypes: ["tactician"],
    lines: [
      "They have range on us. Increase distance.",
      "They hit us once. They'll try the same vector again. Don't let them.",
    ],
  },
  {
    id: "ed-warden",
    context: "any", trigger: "took-damage",
    personalityTypes: ["warden"],
    lines: ["Took a hit. Not fatal. Don't let the next one land.", "Still standing."],
  },
];

// ── Event: docked ─────────────────────────────────────────────────────────────

const EVENT_DOCKED: readonly ConversationEntry[] = [
  {
    id: "ev-dock-brawler",
    context: "any", trigger: "docked",
    personalityTypes: ["brawler"],
    lines: ["Inside. Fine. When do we leave.", "I'll be in the hold if anyone needs me to hit something."],
  },
  {
    id: "ev-dock-ghost",
    context: "any", trigger: "docked",
    personalityTypes: ["ghost"],
    lines: ["Inside. Fewer angles. Good.", "Perimeter check starting."],
  },
  {
    id: "ev-dock-engineer",
    context: "any", trigger: "docked",
    personalityTypes: ["engineer"],
    lines: ["Connecting to station power. Running maintenance cycle.", "Finally. There are things I can only fix at a full dock."],
  },
  {
    id: "ev-dock-medic",
    context: "any", trigger: "docked",
    personalityTypes: ["medic"],
    lines: ["Docked. Running full system scan while we have time.", "Good. I needed this."],
  },
  {
    id: "ev-dock-tactician",
    context: "any", trigger: "docked",
    personalityTypes: ["tactician"],
    lines: ["New environment. I need ten minutes to map it.", "Docked. Updating situational models."],
  },
  {
    id: "ev-dock-warden",
    context: "any", trigger: "docked",
    personalityTypes: ["warden"],
    lines: ["Secure. Relatively.", "Checking station security rating. It's... passable."],
  },
];

// ── Event: undocked ───────────────────────────────────────────────────────────

const EVENT_UNDOCKED: readonly ConversationEntry[] = [
  {
    id: "ev-undock-brawler",
    context: "any", trigger: "undocked",
    personalityTypes: ["brawler"],
    lines: ["Back in open space. This is where I belong.", "Good. Stations make me restless."],
  },
  {
    id: "ev-undock-ghost",
    context: "any", trigger: "undocked",
    personalityTypes: ["ghost"],
    lines: ["Open space again. Wider exposure. Adjusting.", "Eyes forward."],
  },
  {
    id: "ev-undock-engineer",
    context: "any", trigger: "undocked",
    personalityTypes: ["engineer"],
    lines: ["Disconnecting from station systems. Departure checks running.", "Back to underway maintenance. Never ends."],
  },
  {
    id: "ev-undock-tactician",
    context: "any", trigger: "undocked",
    personalityTypes: ["tactician"],
    lines: ["Departure vector plotted. Eyes forward.", "We're exposed again. Back to planning."],
  },
  {
    id: "ev-undock-warden",
    context: "any", trigger: "undocked",
    personalityTypes: ["warden"],
    lines: ["Back on patrol.", "Open space. I prefer this."],
  },
  {
    id: "ev-undock-medic",
    context: "any", trigger: "undocked",
    personalityTypes: ["medic"],
    lines: ["Underway again. Keeping systems warm.", "Back to it."],
  },
];

// ── Event: mind-level-up ──────────────────────────────────────────────────────

const EVENT_LEVEL_UP: readonly ConversationEntry[] = [
  {
    id: "elu-brawler",
    context: "any", trigger: "mind-level-up",
    personalityTypes: ["brawler"],
    lines: ["You're getting sharper. Good.", "I noticed. Keep going."],
  },
  {
    id: "elu-ghost",
    context: "any", trigger: "mind-level-up",
    personalityTypes: ["ghost"],
    lines: [
      "Your response time changed. Positive change.",
      "I notice things. I noticed that.",
    ],
  },
  {
    id: "elu-medic",
    context: "any", trigger: "mind-level-up",
    personalityTypes: ["medic"],
    lines: [
      "Your processing capacity just expanded. Fascinating.",
      "Growth. Good. We need you sharp.",
    ],
  },
  {
    id: "elu-engineer",
    context: "any", trigger: "mind-level-up",
    personalityTypes: ["engineer"],
    lines: [
      "New capability registered in primary systems. Logging it.",
      "Your core architecture just optimised. I can tell from here.",
    ],
  },
  {
    id: "elu-tactician",
    context: "any", trigger: "mind-level-up",
    personalityTypes: ["tactician"],
    lines: [
      "Growth registered. Adjust your models to match.",
      "You're better than you were. Good. Means we plan differently now.",
    ],
  },
  {
    id: "elu-warden",
    context: "any", trigger: "mind-level-up",
    personalityTypes: ["warden"],
    lines: ["Stronger. Good.", "This ship just got better. I'll hold my end."],
  },
];

// ── Master pool ───────────────────────────────────────────────────────────────

export const CONVERSATION_POOL: readonly ConversationEntry[] = [
  ...AMBIENT_CALM,
  ...AMBIENT_TENSE,
  ...AMBIENT_COMBAT,
  ...AMBIENT_DOCKED,
  ...EVENT_KILL,
  ...EVENT_DAMAGE,
  ...EVENT_DOCKED,
  ...EVENT_UNDOCKED,
  ...EVENT_LEVEL_UP,
];
