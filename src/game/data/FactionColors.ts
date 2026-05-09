/**
 * FactionColors — per-faction color palettes applied to ship module rendering.
 *
 * Each key maps to a specific visual element on the drawn ship.  The renderer
 * receives the faction string, looks up the palette here, and uses it instead
 * of the generic neutral colors.
 */

export interface FactionColors {
  hull: {
    /** Base fill for all module polygons. */
    fill: number;
    /** Bevel outline drawn on every module polygon. */
    edge: number;
  };
  reactor: {
    /** Outer reactor rings on core modules. */
    ring: number;
    /** Bright central glow dot on core modules. */
    glow: number;
  };
  engine: {
    /** Exhaust / inner flame color on internal modules. */
    exhaust: number;
    /** Outer ring stroke on internal modules. */
    glow: number;
  };
  guns: {
    /** Muzzle-flash / tip glow on weapon modules. */
    muzzle: number;
    /** Barrel housing fill on weapon modules. */
    barrel: number;
  };
  sensors: {
    /** Emitter lens glow on external modules. */
    lens: number;
    /** Radiating arc beams on external modules. */
    beam: number;
  };
  /** Running-light dots placed at module vertices. */
  lights: number;
  /** Torpedo / missile projectile color (used by projectile renderer). */
  missile: number;
  structure: {
    /** Cross-bracing strokes on structure modules. */
    brace: number;
    /** Junction node fills on structure modules. */
    node: number;
  };
}

// ── Palette definitions ───────────────────────────────────────────────────────

/** Terran Federation — bright silver-blue military. */
const EARTH_COLORS: FactionColors = {
  hull:    { fill: 0xb8ccd8, edge: 0x4477cc },
  reactor: { ring: 0x1155cc, glow: 0x66aaff },
  engine:  { exhaust: 0x4488ff, glow: 0x224488 },
  guns:    { muzzle: 0x44ccff, barrel: 0x3a5a7a },
  sensors: { lens: 0x00ccff, beam: 0x0088ff },
  lights:  0x00ccff,
  missile: 0x44ccff,
  structure: { brace: 0x6688aa, node: 0x5577aa },
};

/** Mars Colonial Authority — warm silver-tan, industrial amber. */
const MARS_COLORS: FactionColors = {
  hull:    { fill: 0xd4bca8, edge: 0xcc6633 },
  reactor: { ring: 0xaa3300, glow: 0xff5500 },
  engine:  { exhaust: 0xff7700, glow: 0x994400 },
  guns:    { muzzle: 0xff4400, barrel: 0x5a3a20 },
  sensors: { lens: 0xffaa00, beam: 0xff6600 },
  lights:  0xff8800,
  missile: 0xff5500,
  structure: { brace: 0x8a6a4a, node: 0xaa7744 },
};

/** Mercenary / Player — pale silver, golden trim. */
const MERCENARY_COLORS: FactionColors = {
  hull:    { fill: 0xc0c4c8, edge: 0xaa9944 },
  reactor: { ring: 0xaa8800, glow: 0xffdd00 },
  engine:  { exhaust: 0xffcc00, glow: 0x886600 },
  guns:    { muzzle: 0xffee44, barrel: 0x5a5030 },
  sensors: { lens: 0xffcc00, beam: 0xcc9900 },
  lights:  0xffdd00,
  missile: 0xffcc00,
  structure: { brace: 0x8a8a60, node: 0x7a7040 },
};

/** Neutral / fallback palette — medium grey-blue. */
const NEUTRAL_COLORS: FactionColors = {
  hull:    { fill: 0x8898aa, edge: 0x5577aa },
  reactor: { ring: 0x1155cc, glow: 0x66aaff },
  engine:  { exhaust: 0xffaa00, glow: 0x996600 },
  guns:    { muzzle: 0xff6600, barrel: 0x4a5a6a },
  sensors: { lens: 0x00bbff, beam: 0x0099ff },
  lights:  0x4499cc,
  missile: 0xff4400,
  structure: { brace: 0x6677aa, node: 0x5566aa },
};

// ── Pirate faction templates ──────────────────────────────────────────────────

export interface PirateFactionTemplate {
  readonly id: string;
  readonly name: string;
  readonly colors: FactionColors;
}

export const PIRATE_FACTION_TEMPLATES: readonly PirateFactionTemplate[] = [
  {
    id: "scavenger-clans",
    name: "Scavenger Clans",
    colors: {
      hull:    { fill: 0x3c2a1a, edge: 0xcc6633 },
      reactor: { ring: 0xcc4400, glow: 0xff6600 },
      engine:  { exhaust: 0xff8800, glow: 0x883300 },
      guns:    { muzzle: 0xff5500, barrel: 0x3a2010 },
      sensors: { lens: 0x44ff88, beam: 0x00ff44 },
      lights:  0xff6600,
      missile: 0xff6600,
      structure: { brace: 0x664422, node: 0x886633 },
    },
  },
  {
    id: "neon-punks",
    name: "Neon Punks",
    colors: {
      hull:    { fill: 0x2a0a20, edge: 0xff22aa },
      reactor: { ring: 0xff00cc, glow: 0xff66ee },
      engine:  { exhaust: 0x00ffcc, glow: 0x009988 },
      guns:    { muzzle: 0xff44dd, barrel: 0x3a0a2a },
      sensors: { lens: 0x00ffff, beam: 0x00cccc },
      lights:  0xff00ff,
      missile: 0xff44dd,
      structure: { brace: 0x882266, node: 0xaa4488 },
    },
  },
  {
    id: "void-reavers",
    name: "Void Reavers",
    colors: {
      hull:    { fill: 0x160820, edge: 0x8844ff },
      reactor: { ring: 0x6600cc, glow: 0xaa44ff },
      engine:  { exhaust: 0xcc88ff, glow: 0x440088 },
      guns:    { muzzle: 0xaa44ff, barrel: 0x2a1040 },
      sensors: { lens: 0xcc44ff, beam: 0x8800ff },
      lights:  0x8844ff,
      missile: 0xcc44ff,
      structure: { brace: 0x442266, node: 0x6633aa },
    },
  },
  {
    id: "chrome-wolves",
    name: "Chrome Wolves",
    colors: {
      hull:    { fill: 0xd0d8e8, edge: 0x88ccff },
      reactor: { ring: 0x4488ff, glow: 0xaaddff },
      engine:  { exhaust: 0x88ccff, glow: 0x224488 },
      guns:    { muzzle: 0xffffff, barrel: 0x8898aa },
      sensors: { lens: 0xaaddff, beam: 0x6699ff },
      lights:  0xaaddff,
      missile: 0x88ccff,
      structure: { brace: 0x8899bb, node: 0x99aacc },
    },
  },
  {
    id: "crimson-tide",
    name: "Crimson Tide",
    colors: {
      hull:    { fill: 0x6a0a0a, edge: 0xff4444 },
      reactor: { ring: 0xff2222, glow: 0xff8888 },
      engine:  { exhaust: 0xff6600, glow: 0x882200 },
      guns:    { muzzle: 0xff4444, barrel: 0x3a0808 },
      sensors: { lens: 0xff4444, beam: 0xcc2222 },
      lights:  0xff2222,
      missile: 0xff4444,
      structure: { brace: 0x882222, node: 0xaa3333 },
    },
  },
  {
    id: "acid-syndicate",
    name: "Acid Syndicate",
    colors: {
      hull:    { fill: 0x0e2a0e, edge: 0x66ff44 },
      reactor: { ring: 0x44cc00, glow: 0x88ff44 },
      engine:  { exhaust: 0x88ff00, glow: 0x336600 },
      guns:    { muzzle: 0x66ff44, barrel: 0x1a3a0a },
      sensors: { lens: 0xaaff44, beam: 0x66dd00 },
      lights:  0x44ff44,
      missile: 0x66ff44,
      structure: { brace: 0x336622, node: 0x449933 },
    },
  },
  {
    id: "iron-corsairs",
    name: "Iron Corsairs",
    colors: {
      hull:    { fill: 0x2a2a3a, edge: 0xff8833 },
      reactor: { ring: 0xcc6600, glow: 0xff9944 },
      engine:  { exhaust: 0xff8833, glow: 0x884422 },
      guns:    { muzzle: 0xff8833, barrel: 0x2a2020 },
      sensors: { lens: 0xffaa44, beam: 0xff8800 },
      lights:  0xff8833,
      missile: 0xff8833,
      structure: { brace: 0x555566, node: 0x776655 },
    },
  },
];

const PALETTES: Record<string, FactionColors> = {
  earth:      EARTH_COLORS,
  mars:       MARS_COLORS,
  mercenary:  MERCENARY_COLORS,
  player:     MERCENARY_COLORS,
  pirate:     PIRATE_FACTION_TEMPLATES[0]!.colors, // overridden at runtime by active template
};

export function getFactionColors(faction?: string): FactionColors {
  return (faction ? PALETTES[faction] : undefined) ?? NEUTRAL_COLORS;
}
