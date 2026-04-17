/**
 * BossArt – layered polygon compositions for every boss.
 *
 * Each boss "art" is a function that paints its body (the non-destructible
 * hull + decorative layers) into the entity Graphics, using 20+ stacked
 * shapes to read as a rich silhouette at 1280×720.
 *
 * Parts (turrets, armor, core) are drawn separately by the renderer so they
 * can carry damage-flash and "weak point" visual cues.
 *
 * Lookup is by `artId` on BossState — BossRegistry wires each definition
 * to the matching `artId` key in BOSS_ART.
 */

import type { Graphics } from "pixi.js";
import type { BossState } from "../types/index";
import {
  drawCircle,
  drawHexagon,
  drawOctagon,
  drawPentagon,
  drawRect,
  drawRotatedRect,
  drawTriangle,
} from "./ShapePrimitives";

export type BossArtFn = (g: Graphics, b: Readonly<BossState>, time: number) => void;

/**
 * Sentinel — classic wedge-nosed flagship. Triangular nose, rectangular
 * midship, hex thruster pods, pentagon bridge.
 */
const drawSentinel: BossArtFn = (g, b, _t) => {
  const { x, y } = b.position;
  const w = b.width;
  const h = b.height;
  const primary = b.colorPrimary ?? 0xff0066;
  const accent = b.colorAccent ?? 0xffaacc;
  const dark = 0x220011;

  // 1. Outer aura (soft glow)
  drawHexagon(g, x, y, w * 0.75, 0, { color: primary, alpha: 0.15 });
  // 2. Engine plume left
  drawTriangle(g, x + w * 0.55, y - h * 0.28, w * 0.22, 0, { color: 0xffcc66, alpha: 0.55 });
  // 3. Engine plume right
  drawTriangle(g, x + w * 0.55, y + h * 0.28, w * 0.22, 0, { color: 0xffcc66, alpha: 0.55 });
  // 4. Main hull – elongated octagon
  drawOctagon(g, x, y, w * 0.55, 0, { color: primary }, { color: accent, width: 3 });
  // 5. Midship armor plate (rect)
  drawRect(g, x, y, w * 0.9, h * 0.42, { color: dark }, { color: accent, width: 2 });
  // 6. Wing top
  drawTriangle(g, x + w * 0.05, y - h * 0.45, w * 0.38, Math.PI * 0.45,
    { color: primary }, { color: accent, width: 2 });
  // 7. Wing bottom
  drawTriangle(g, x + w * 0.05, y + h * 0.45, w * 0.38, -Math.PI * 0.45,
    { color: primary }, { color: accent, width: 2 });
  // 8. Nose (pointing left toward player)
  drawTriangle(g, x - w * 0.5, y, w * 0.35, Math.PI,
    { color: accent }, { color: 0xffffff, width: 2 });
  // 9. Nose inner highlight
  drawTriangle(g, x - w * 0.4, y, w * 0.18, Math.PI, { color: 0xffffff, alpha: 0.6 });
  // 10. Bridge – pentagon
  drawPentagon(g, x + w * 0.15, y, h * 0.22, Math.PI / 2,
    { color: dark }, { color: accent, width: 2 });
  // 11. Bridge window
  drawCircle(g, x + w * 0.15, y, 5, { color: 0xffffff });
  // 12-14. Thruster pods (hex triplet on tail)
  for (let i = -1; i <= 1; i++) {
    drawHexagon(g, x + w * 0.42, y + i * h * 0.22, h * 0.1, 0,
      { color: dark }, { color: 0xffcc66, width: 2 });
    drawCircle(g, x + w * 0.42, y + i * h * 0.22, 3, { color: 0xffdd88 });
  }
  // 15-16. Wing-tip triangles
  drawTriangle(g, x + w * 0.2, y - h * 0.55, h * 0.14, -Math.PI / 2,
    { color: accent });
  drawTriangle(g, x + w * 0.2, y + h * 0.55, h * 0.14, Math.PI / 2,
    { color: accent });
  // 17-18. Hull detail ribs
  drawRect(g, x - w * 0.1, y - h * 0.35, w * 0.3, 3, { color: accent });
  drawRect(g, x - w * 0.1, y + h * 0.35, w * 0.3, 3, { color: accent });
  // 19-20. Nose side fins
  drawTriangle(g, x - w * 0.25, y - h * 0.3, h * 0.14, Math.PI * 0.8,
    { color: primary }, { color: accent, width: 1 });
  drawTriangle(g, x - w * 0.25, y + h * 0.3, h * 0.14, -Math.PI * 0.8,
    { color: primary }, { color: accent, width: 1 });
};

/**
 * Skirmisher — sleek dart. Twin side-cannons on each wing tip.
 */
const drawSkirmisher: BossArtFn = (g, b, _t) => {
  const { x, y } = b.position;
  const w = b.width;
  const h = b.height;
  const primary = b.colorPrimary ?? 0x33ccff;
  const accent = b.colorAccent ?? 0xaaeeff;
  const dark = 0x001122;

  drawPentagon(g, x, y, w * 0.55, -Math.PI / 2, { color: primary, alpha: 0.2 });
  drawTriangle(g, x - w * 0.55, y, w * 0.4, Math.PI,
    { color: primary }, { color: accent, width: 3 });
  drawRect(g, x + w * 0.1, y, w * 0.6, h * 0.3, { color: primary }, { color: accent, width: 2 });
  drawHexagon(g, x, y, h * 0.35, 0, { color: dark }, { color: accent, width: 2 });
  drawRotatedRect(g, x + w * 0.15, y - h * 0.4, w * 0.5, h * 0.12, 0.15,
    { color: primary }, { color: accent, width: 2 });
  drawRotatedRect(g, x + w * 0.15, y + h * 0.4, w * 0.5, h * 0.12, -0.15,
    { color: primary }, { color: accent, width: 2 });
  drawTriangle(g, x - w * 0.35, y, w * 0.15, Math.PI, { color: 0xffffff, alpha: 0.7 });
  drawCircle(g, x, y, 8, { color: 0xffffff }, { color: accent, width: 2 });
  drawCircle(g, x, y, 3, { color: primary });
  for (let i = 0; i < 4; i++) {
    drawCircle(g, x + w * 0.15 + i * 6, y, 2, { color: accent });
  }
  drawTriangle(g, x + w * 0.4, y - h * 0.25, h * 0.14, 0, { color: 0xffcc33, alpha: 0.8 });
  drawTriangle(g, x + w * 0.4, y + h * 0.25, h * 0.14, 0, { color: 0xffcc33, alpha: 0.8 });
  drawRect(g, x + w * 0.35, y, w * 0.15, 4, { color: accent });
  drawPentagon(g, x - w * 0.1, y - h * 0.3, h * 0.12, 0, { color: dark }, { color: accent, width: 1 });
  drawPentagon(g, x - w * 0.1, y + h * 0.3, h * 0.12, 0, { color: dark }, { color: accent, width: 1 });
  drawTriangle(g, x + w * 0.1, y - h * 0.15, h * 0.08, Math.PI * 0.5, { color: accent });
  drawTriangle(g, x + w * 0.1, y + h * 0.15, h * 0.08, -Math.PI * 0.5, { color: accent });
};

/**
 * Warden — chunky fortress. Octagonal hull, armored bands, top + bottom shields.
 */
const drawWarden: BossArtFn = (g, b, _t) => {
  const { x, y } = b.position;
  const w = b.width;
  const h = b.height;
  const primary = b.colorPrimary ?? 0xffaa33;
  const accent = b.colorAccent ?? 0xffdd88;
  const dark = 0x331100;

  drawOctagon(g, x, y, w * 0.6, 0, { color: primary, alpha: 0.15 });
  drawOctagon(g, x, y, w * 0.5, 0, { color: primary }, { color: accent, width: 4 });
  drawRect(g, x, y - h * 0.35, w * 0.7, h * 0.18, { color: dark }, { color: accent, width: 2 });
  drawRect(g, x, y + h * 0.35, w * 0.7, h * 0.18, { color: dark }, { color: accent, width: 2 });
  drawHexagon(g, x - w * 0.25, y, h * 0.35, 0, { color: dark }, { color: accent, width: 2 });
  drawHexagon(g, x + w * 0.25, y, h * 0.35, 0, { color: dark }, { color: accent, width: 2 });
  drawRect(g, x - w * 0.45, y, w * 0.18, h * 0.35, { color: primary }, { color: accent, width: 2 });
  drawTriangle(g, x - w * 0.55, y, h * 0.25, Math.PI, { color: accent });
  drawPentagon(g, x, y, h * 0.25, Math.PI / 2, { color: dark }, { color: 0xffffff, width: 2 });
  drawCircle(g, x, y, 9, { color: 0xffaa33 });
  drawCircle(g, x, y, 4, { color: 0xffffff });
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    drawCircle(g, x + Math.cos(ang) * w * 0.35, y + Math.sin(ang) * h * 0.42, 3, { color: accent });
  }
  drawRect(g, x + w * 0.05, y - h * 0.15, w * 0.4, 3, { color: accent });
  drawRect(g, x + w * 0.05, y + h * 0.15, w * 0.4, 3, { color: accent });
  drawTriangle(g, x + w * 0.4, y - h * 0.45, h * 0.14, 0, { color: accent });
  drawTriangle(g, x + w * 0.4, y + h * 0.45, h * 0.14, 0, { color: accent });
};

/**
 * Weaver — organic erratic shape. Concentric hexagons with angled blade fins.
 */
const drawWeaver: BossArtFn = (g, b, t) => {
  const { x, y } = b.position;
  const w = b.width;
  const h = b.height;
  const primary = b.colorPrimary ?? 0x9933ff;
  const accent = b.colorAccent ?? 0xddaaff;
  const dark = 0x110022;

  drawHexagon(g, x, y, w * 0.6, t * 0.3, { color: primary, alpha: 0.2 });
  drawHexagon(g, x, y, w * 0.5, -t * 0.4,
    { color: primary }, { color: accent, width: 3 });
  drawHexagon(g, x, y, w * 0.32, t * 0.6,
    { color: dark }, { color: accent, width: 2 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + t * 0.2;
    const bx = x + Math.cos(a) * w * 0.5;
    const by = y + Math.sin(a) * h * 0.5;
    drawTriangle(g, bx, by, h * 0.16, a,
      { color: accent }, { color: primary, width: 1 });
  }
  drawPentagon(g, x, y, h * 0.18, -t,
    { color: 0xffffff, alpha: 0.4 });
  drawCircle(g, x, y, 10, { color: accent });
  drawCircle(g, x, y, 5, { color: 0xffffff });
  for (let i = 0; i < 4; i++) {
    const a = t * 0.6 + (i * Math.PI / 2);
    drawRect(g, x + Math.cos(a) * w * 0.18, y + Math.sin(a) * h * 0.18,
      4, 4, { color: 0xffffff, alpha: 0.85 });
  }
  drawTriangle(g, x - w * 0.5, y, h * 0.22, Math.PI, { color: accent });
  drawTriangle(g, x + w * 0.5, y, h * 0.22, 0, { color: accent });
};

/**
 * Dreadnought — massive warship. Long rect hull, three engine pods,
 * armored prow, dorsal turrets (parts), flanking wings.
 */
const drawDreadnought: BossArtFn = (g, b, _t) => {
  const { x, y } = b.position;
  const w = b.width;
  const h = b.height;
  const primary = b.colorPrimary ?? 0xff3355;
  const accent = b.colorAccent ?? 0xffaaaa;
  const dark = 0x220000;

  drawRect(g, x, y, w * 0.95, h * 0.5, { color: primary, alpha: 0.2 });
  drawRect(g, x, y, w * 0.9, h * 0.4, { color: primary }, { color: accent, width: 4 });
  drawRect(g, x, y - h * 0.35, w * 0.8, h * 0.2, { color: dark }, { color: accent, width: 2 });
  drawRect(g, x, y + h * 0.35, w * 0.8, h * 0.2, { color: dark }, { color: accent, width: 2 });
  drawTriangle(g, x - w * 0.5, y - h * 0.3, h * 0.25, Math.PI * 0.9,
    { color: primary }, { color: accent, width: 2 });
  drawTriangle(g, x - w * 0.5, y + h * 0.3, h * 0.25, -Math.PI * 0.9,
    { color: primary }, { color: accent, width: 2 });
  drawPentagon(g, x - w * 0.45, y, h * 0.3, -Math.PI / 2,
    { color: dark }, { color: accent, width: 2 });
  drawTriangle(g, x - w * 0.55, y, h * 0.22, Math.PI, { color: accent });
  for (let i = -1; i <= 1; i++) {
    drawHexagon(g, x + w * 0.42, y + i * h * 0.22, h * 0.11, 0,
      { color: dark }, { color: 0xff8855, width: 2 });
    drawCircle(g, x + w * 0.42, y + i * h * 0.22, 4, { color: 0xffcc66 });
  }
  drawRect(g, x + w * 0.05, y, w * 0.4, 4, { color: accent });
  drawRect(g, x - w * 0.2, y - h * 0.1, w * 0.4, 3, { color: accent, alpha: 0.7 });
  drawRect(g, x - w * 0.2, y + h * 0.1, w * 0.4, 3, { color: accent, alpha: 0.7 });
  drawOctagon(g, x + w * 0.15, y, h * 0.2, 0,
    { color: dark }, { color: accent, width: 2 });
  drawCircle(g, x + w * 0.15, y, 5, { color: 0xffffff });
  drawTriangle(g, x + w * 0.48, y, h * 0.14, 0, { color: 0xffcc66, alpha: 0.85 });
};

/**
 * Phantom — ghostly tri-wing. Layered rotating triangles, glowing core.
 */
const drawPhantom: BossArtFn = (g, b, t) => {
  const { x, y } = b.position;
  const w = b.width;
  const h = b.height;
  const primary = b.colorPrimary ?? 0x00ffaa;
  const accent = b.colorAccent ?? 0xccffee;
  const dark = 0x002211;

  for (let ring = 0; ring < 3; ring++) {
    const rot = t * (ring % 2 === 0 ? 0.5 : -0.5) + ring * 0.7;
    const size = w * (0.55 - ring * 0.12);
    const alpha = 0.6 - ring * 0.15;
    for (let i = 0; i < 3; i++) {
      const a = rot + (i / 3) * Math.PI * 2;
      drawTriangle(g, x, y, size, a,
        { color: primary, alpha }, { color: accent, width: 2, alpha: alpha + 0.2 });
    }
  }
  drawHexagon(g, x, y, h * 0.32, t * 0.8,
    { color: dark }, { color: accent, width: 2 });
  drawPentagon(g, x, y, h * 0.2, -t,
    { color: primary }, { color: 0xffffff, width: 1 });
  drawCircle(g, x, y, 11, { color: accent });
  drawCircle(g, x, y, 6, { color: 0xffffff });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + t * 0.4;
    drawCircle(g, x + Math.cos(a) * w * 0.35, y + Math.sin(a) * h * 0.35, 3,
      { color: accent, alpha: 0.8 });
  }
  drawTriangle(g, x - w * 0.5, y, h * 0.18, Math.PI,
    { color: 0xffffff, alpha: 0.5 });
};

/**
 * Carrier — massive mothership with three open hangar bays on the rear flanks.
 * Slow, broad silhouette; pulsing bay lights signal incoming wave launches.
 */
const drawCarrier: BossArtFn = (g, b, t) => {
  const { x, y } = b.position;
  const w = b.width;
  const h = b.height;
  const primary = b.colorPrimary ?? 0x5577aa;
  const accent = b.colorAccent ?? 0xbbccee;
  const dark = 0x0a1422;
  const bayGlow = 0xffcc66;

  // 1. Outer silhouette aura
  drawRect(g, x, y, w * 1.05, h * 0.7, { color: primary, alpha: 0.18 });
  // 2. Main hull — long flat slab
  drawRect(g, x, y, w * 0.95, h * 0.55, { color: primary }, { color: accent, width: 4 });
  // 3. Top deck armor strip
  drawRect(g, x, y - h * 0.3, w * 0.85, h * 0.12, { color: dark }, { color: accent, width: 2 });
  // 4. Bottom deck armor strip
  drawRect(g, x, y + h * 0.3, w * 0.85, h * 0.12, { color: dark }, { color: accent, width: 2 });
  // 5. Fore prow — slight wedge
  drawTriangle(g, x - w * 0.5, y, h * 0.32, Math.PI,
    { color: primary }, { color: accent, width: 2 });
  // 6. Nose inner highlight
  drawTriangle(g, x - w * 0.42, y, h * 0.18, Math.PI, { color: accent, alpha: 0.7 });
  // 7. Aft hangar shell — top bay opening
  const bayPulse = 0.65 + Math.sin(t * 2.4) * 0.35;
  drawRect(g, x + w * 0.28, y - h * 0.25, w * 0.34, h * 0.18,
    { color: dark }, { color: accent, width: 2 });
  drawRect(g, x + w * 0.28, y - h * 0.25, w * 0.28, h * 0.1,
    { color: bayGlow, alpha: 0.85 * bayPulse });
  // 8. Hangar bay — middle slot
  drawRect(g, x + w * 0.32, y, w * 0.3, h * 0.14,
    { color: dark }, { color: accent, width: 2 });
  drawRect(g, x + w * 0.32, y, w * 0.24, h * 0.08,
    { color: bayGlow, alpha: 0.85 * bayPulse });
  // 9. Hangar bay — bottom
  drawRect(g, x + w * 0.28, y + h * 0.25, w * 0.34, h * 0.18,
    { color: dark }, { color: accent, width: 2 });
  drawRect(g, x + w * 0.28, y + h * 0.25, w * 0.28, h * 0.1,
    { color: bayGlow, alpha: 0.85 * bayPulse });
  // 10. Command tower (dorsal)
  drawPentagon(g, x - w * 0.1, y - h * 0.42, h * 0.16, -Math.PI / 2,
    { color: dark }, { color: accent, width: 2 });
  drawRect(g, x - w * 0.1, y - h * 0.52, w * 0.18, 4, { color: accent });
  // 11. Ventral tower
  drawPentagon(g, x - w * 0.1, y + h * 0.42, h * 0.16, Math.PI / 2,
    { color: dark }, { color: accent, width: 2 });
  // 12. Bridge windows
  for (let i = 0; i < 4; i++) {
    drawCircle(g, x - w * 0.25 + i * 12, y - h * 0.42, 3, { color: 0xffffff, alpha: 0.85 });
  }
  // 13-15. Three engine pods at rear
  for (let i = -1; i <= 1; i++) {
    drawHexagon(g, x + w * 0.48, y + i * h * 0.3, h * 0.08, 0,
      { color: dark }, { color: 0xffaa66, width: 2 });
    drawCircle(g, x + w * 0.48, y + i * h * 0.3, 4, { color: 0xffcc66, alpha: 0.9 });
  }
  // 16. Midship hull seam
  drawRect(g, x, y, w * 0.8, 3, { color: accent, alpha: 0.6 });
  // 17. Upper hull ribs
  drawRect(g, x - w * 0.2, y - h * 0.18, w * 0.5, 2, { color: accent, alpha: 0.5 });
  // 18. Lower hull ribs
  drawRect(g, x - w * 0.2, y + h * 0.18, w * 0.5, 2, { color: accent, alpha: 0.5 });
  // 19. Central comm dish
  drawCircle(g, x - w * 0.25, y, 9, { color: dark }, { color: accent, width: 2 });
  drawCircle(g, x - w * 0.25, y, 4, { color: 0xffffff });
  // 20. Antenna mast
  drawRect(g, x - w * 0.25, y - h * 0.2, 2, h * 0.12, { color: accent });
  // 21. Prow running lights
  drawCircle(g, x - w * 0.45, y - h * 0.12, 2, { color: 0xff6655 });
  drawCircle(g, x - w * 0.45, y + h * 0.12, 2, { color: 0x55ff99 });
};

export const BOSS_ART: Record<string, BossArtFn> = {
  sentinel: drawSentinel,
  skirmisher: drawSkirmisher,
  warden: drawWarden,
  weaver: drawWeaver,
  dreadnought: drawDreadnought,
  phantom: drawPhantom,
  carrier: drawCarrier,
};

export function drawBossBody(g: Graphics, b: Readonly<BossState>, time: number): void {
  const fn = b.artId ? BOSS_ART[b.artId] : undefined;
  if (fn) fn(g, b, time);
}
