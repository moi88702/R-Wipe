/**
 * GradeColors — per-grade material palettes for ship module rendering.
 *
 * Grade equals sizeClass (1–9).  Grade colors drive the *physical* look of a
 * device — barrel material, exhaust plasma, lens crystal — independent of
 * faction paint.  Faction colors still control trim, lights, and hull edge.
 *
 *   surface   — main body material fill
 *   highlight — bright edge / rivet / fine detail
 *   effect    — muzzle flash / exhaust jet / beam / shield dome energy
 *   glow      — ambient outer bloom (drawn at low alpha)
 */

export interface GradePalette {
  surface: number;
  highlight: number;
  effect: number;
  glow: number;
}

const GRADE_PALETTES: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, GradePalette> = {
  // 1 — gunmetal (worn dark steel)
  1: { surface: 0x3a3c40, highlight: 0x606468, effect: 0xaaaaaa, glow: 0x282a2e },
  // 2 — silver (polished alloy)
  2: { surface: 0x7a8898, highlight: 0xc8d8e8, effect: 0xd0e8ff, glow: 0x5878a0 },
  // 3 — military red (hardened ceramic coat)
  3: { surface: 0x7a1515, highlight: 0xcc3333, effect: 0xff4444, glow: 0x991111 },
  // 4 — burnished gold (resonance-treated alloy)
  4: { surface: 0x6a5000, highlight: 0xddaa00, effect: 0xffdd44, glow: 0xaa8000 },
  // 5 — electric green glow (phase-shifted exotic matter)
  5: { surface: 0x003322, highlight: 0x00ff88, effect: 0x44ffaa, glow: 0x00cc66 },
  // 6 — electric blue (charged particle lattice)
  6: { surface: 0x001a44, highlight: 0x0088ff, effect: 0x44aaff, glow: 0x0055cc },
  // 7 — void purple (zero-point energy crystal)
  7: { surface: 0x1a0040, highlight: 0xcc00ff, effect: 0xff44ff, glow: 0x8800cc },
  // 8 — plasma orange (hyper-compressed plasma state)
  8: { surface: 0x3a1500, highlight: 0xff6600, effect: 0xff9933, glow: 0xcc4400 },
  // 9 — stellar white (quantum singularity state)
  9: { surface: 0x404058, highlight: 0xffffff, effect: 0xaaccff, glow: 0xccddff },
};

export function getGradeColors(grade: number): GradePalette {
  const clamped = Math.max(1, Math.min(9, Math.round(grade))) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  return GRADE_PALETTES[clamped];
}
