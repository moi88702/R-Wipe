/**
 * ShapePrimitives – Composable polygon drawing helpers.
 *
 * Build complex ship / boss silhouettes by layering triangles, rects,
 * pentagons, hexagons, and octagons. Every helper mutates an existing
 * `Graphics` object so callers can chain multiple fills + strokes to
 * compose a single layered silhouette.
 *
 * Coordinate convention: `x, y` is the centre of the shape, `size` is its
 * radius (circumradius for regular polygons, half-extent for rect / tri).
 */

import type { Graphics } from "pixi.js";

export interface FillStyle {
  color: number;
  alpha?: number;
}

export interface StrokeStyle {
  color: number;
  width: number;
  alpha?: number;
}

/** Regular polygon with `sides` vertices, centred on (x, y). */
export function regularPolyPoints(
  sides: number,
  cx: number,
  cy: number,
  size: number,
  rotation = 0,
): number[] {
  const pts: number[] = [];
  // Start pointing "up" by default (subtract PI/2 so 0 rotation = top vertex).
  for (let i = 0; i < sides; i++) {
    const angle = rotation - Math.PI / 2 + (Math.PI * 2 * i) / sides;
    pts.push(cx + Math.cos(angle) * size);
    pts.push(cy + Math.sin(angle) * size);
  }
  return pts;
}

/** Isoceles triangle pointing at `angle` (radians). */
export function trianglePoints(
  cx: number,
  cy: number,
  size: number,
  angle = 0,
  widthRatio = 0.9,
): number[] {
  const base = size * widthRatio;
  // Tip forward, two base vertices backward.
  const tip = [cx + Math.cos(angle) * size, cy + Math.sin(angle) * size];
  const backLeft = [
    cx + Math.cos(angle + Math.PI * 0.85) * base,
    cy + Math.sin(angle + Math.PI * 0.85) * base,
  ];
  const backRight = [
    cx + Math.cos(angle - Math.PI * 0.85) * base,
    cy + Math.sin(angle - Math.PI * 0.85) * base,
  ];
  return [tip[0]!, tip[1]!, backLeft[0]!, backLeft[1]!, backRight[0]!, backRight[1]!];
}

/** Axis-aligned rectangle (centre-anchored). */
export function drawRect(
  g: Graphics,
  cx: number,
  cy: number,
  w: number,
  h: number,
  fill?: FillStyle,
  stroke?: StrokeStyle,
): Graphics {
  g.rect(cx - w / 2, cy - h / 2, w, h);
  if (fill) g.fill(fill);
  if (stroke) g.stroke(stroke);
  return g;
}

/** Rotated rectangle via polygon path. */
export function drawRotatedRect(
  g: Graphics,
  cx: number,
  cy: number,
  w: number,
  h: number,
  angle: number,
  fill?: FillStyle,
  stroke?: StrokeStyle,
): Graphics {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hw = w / 2;
  const hh = h / 2;
  const corners = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([x, y]) => [cx + x! * cos - y! * sin, cy + x! * sin + y! * cos]);
  g.poly(corners.flat());
  if (fill) g.fill(fill);
  if (stroke) g.stroke(stroke);
  return g;
}

export function drawTriangle(
  g: Graphics,
  cx: number,
  cy: number,
  size: number,
  angle = 0,
  fill?: FillStyle,
  stroke?: StrokeStyle,
  widthRatio = 0.9,
): Graphics {
  g.poly(trianglePoints(cx, cy, size, angle, widthRatio));
  if (fill) g.fill(fill);
  if (stroke) g.stroke(stroke);
  return g;
}

export function drawRegularPoly(
  g: Graphics,
  sides: number,
  cx: number,
  cy: number,
  size: number,
  rotation: number,
  fill?: FillStyle,
  stroke?: StrokeStyle,
): Graphics {
  g.poly(regularPolyPoints(sides, cx, cy, size, rotation));
  if (fill) g.fill(fill);
  if (stroke) g.stroke(stroke);
  return g;
}

export const drawPentagon = (g: Graphics, cx: number, cy: number, size: number, rot = 0, fill?: FillStyle, stroke?: StrokeStyle) =>
  drawRegularPoly(g, 5, cx, cy, size, rot, fill, stroke);
export const drawHexagon = (g: Graphics, cx: number, cy: number, size: number, rot = 0, fill?: FillStyle, stroke?: StrokeStyle) =>
  drawRegularPoly(g, 6, cx, cy, size, rot, fill, stroke);
export const drawOctagon = (g: Graphics, cx: number, cy: number, size: number, rot = 0, fill?: FillStyle, stroke?: StrokeStyle) =>
  drawRegularPoly(g, 8, cx, cy, size, rot, fill, stroke);

/** Draw a circle. Useful for eye / core accents on layered silhouettes. */
export function drawCircle(
  g: Graphics,
  cx: number,
  cy: number,
  r: number,
  fill?: FillStyle,
  stroke?: StrokeStyle,
): Graphics {
  g.circle(cx, cy, r);
  if (fill) g.fill(fill);
  if (stroke) g.stroke(stroke);
  return g;
}
