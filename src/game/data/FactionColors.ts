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

/** Terran Federation — clean military blues & silver. */
const EARTH_COLORS: FactionColors = {
  hull:    { fill: 0x080f1a, edge: 0x3a5570 },
  reactor: { ring: 0x1155cc, glow: 0x66aaff },
  engine:  { exhaust: 0x4488ff, glow: 0x224488 },
  guns:    { muzzle: 0x44ccff, barrel: 0x1a2a3a },
  sensors: { lens: 0x00ccff, beam: 0x0088ff },
  lights:  0x00ccff,
  missile: 0x44ccff,
  structure: { brace: 0x445566, node: 0x334455 },
};

/** Scavenger Clans pirates — rust, orange, salvaged green sensors. */
const PIRATE_COLORS: FactionColors = {
  hull:    { fill: 0x140600, edge: 0x6b3a1f },
  reactor: { ring: 0xcc4400, glow: 0xff6600 },
  engine:  { exhaust: 0xff8800, glow: 0x883300 },
  guns:    { muzzle: 0xff5500, barrel: 0x2a1000 },
  sensors: { lens: 0x44ff88, beam: 0x00ff44 },
  lights:  0xff6600,
  missile: 0xff6600,
  structure: { brace: 0x664422, node: 0x886633 },
};

/** Mars Colonial Authority — amber, red-orange, industrial. */
const MARS_COLORS: FactionColors = {
  hull:    { fill: 0x100504, edge: 0x5a2810 },
  reactor: { ring: 0xaa3300, glow: 0xff5500 },
  engine:  { exhaust: 0xff7700, glow: 0x994400 },
  guns:    { muzzle: 0xff4400, barrel: 0x220800 },
  sensors: { lens: 0xffaa00, beam: 0xff6600 },
  lights:  0xff8800,
  missile: 0xff5500,
  structure: { brace: 0x6a3a1f, node: 0x8a4422 },
};

/** Mercenary — gunmetal & gold, distinct from all faction colors. */
const MERCENARY_COLORS: FactionColors = {
  hull:    { fill: 0x0e0e10, edge: 0x7a6a30 },
  reactor: { ring: 0xaa8800, glow: 0xffdd00 },
  engine:  { exhaust: 0xffcc00, glow: 0x886600 },
  guns:    { muzzle: 0xffee44, barrel: 0x1a1800 },
  sensors: { lens: 0xffcc00, beam: 0xcc9900 },
  lights:  0xffdd00,
  missile: 0xffcc00,
  structure: { brace: 0x7a6a30, node: 0x554420 },
};

/** Neutral / fallback palette (existing grey-blue tones). */
const NEUTRAL_COLORS: FactionColors = {
  hull:    { fill: 0x0b1218, edge: 0x3a5570 },
  reactor: { ring: 0x1155cc, glow: 0x66aaff },
  engine:  { exhaust: 0xffaa00, glow: 0x996600 },
  guns:    { muzzle: 0xff6600, barrel: 0x223344 },
  sensors: { lens: 0x00bbff, beam: 0x0099ff },
  lights:  0x4499cc,
  missile: 0xff4400,
  structure: { brace: 0x445566, node: 0x334455 },
};

const PALETTES: Record<string, FactionColors> = {
  earth:      EARTH_COLORS,
  pirate:     PIRATE_COLORS,
  mars:       MARS_COLORS,
  mercenary:  MERCENARY_COLORS,
  player:     MERCENARY_COLORS, // player is mercenary faction
};

export function getFactionColors(faction?: string): FactionColors {
  return (faction ? PALETTES[faction] : undefined) ?? NEUTRAL_COLORS;
}
