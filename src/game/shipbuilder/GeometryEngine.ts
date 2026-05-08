/**
 * GeometryEngine — pure geometry for the polygon ship builder.
 *
 * All methods are static and side-effect free. Nothing touches Pixi or game
 * state. Callers own the data structures and treat results as immutable.
 *
 * Polygon conventions:
 *   - vertex[i] = center + circumradius × (cos(rotation + i·2π/N), sin(rotation + i·2π/N))
 *   - side i runs from vertex[i] to vertex[(i+1)%N]
 *   - side i outward-normal angle = rotation + i·2π/N + π/N
 *   - apothem (center → side midpoint) = sideLengthPx / (2·tan(π/N))
 *
 * Snap alignment:
 *   Given parent side i with outward-normal α and midpoint (mx, my), and a
 *   child module with N_c sides and apothem a_c:
 *     child center    = (mx + a_c·cos(α),  my + a_c·sin(α))
 *     child rotation  = α + π − π/N_c − j·(2π/N_c)
 *   where j is chosen to minimise |child rotation| (least visual spin).
 */

import type {
  SolarModuleDefinition,
  PlacedSolarModule,
  ModuleGeometry,
  SideData,
  SolarSnapPoint,
} from "../../types/solarShipBuilder";

export class GeometryEngine {
  /** Cursor must be within this many px of the snapped center to trigger snap. */
  static readonly SNAP_THRESHOLD_PX = 50;

  // ── Primitive math ──────────────────────────────────────────────────────────

  static circumradius(sides: number, sideLengthPx: number): number {
    return sideLengthPx / (2 * Math.sin(Math.PI / sides));
  }

  static apothem(sides: number, sideLengthPx: number): number {
    return sideLengthPx / (2 * Math.tan(Math.PI / sides));
  }

  // ── Vertex / side builders ──────────────────────────────────────────────────

  static buildVertices(
    sides: number,
    sideLengthPx: number,
    cx: number,
    cy: number,
    rotationRad: number,
  ): Array<{ x: number; y: number }> {
    const r = GeometryEngine.circumradius(sides, sideLengthPx);
    const step = (2 * Math.PI) / sides;
    return Array.from({ length: sides }, (_, i) => ({
      x: cx + r * Math.cos(rotationRad + i * step),
      y: cy + r * Math.sin(rotationRad + i * step),
    }));
  }

  /**
   * Build visual vertices from a unit-coordinate template.
   * verts[i] = [ux, uy] where 1.0 = sideLengthPx.
   *
   * Templates are authored with their "output end" (barrel tip, bell nozzle,
   * dish face) at −Y and their attachment base at +Y. This function rotates
   * them so the output end points radially outward from the ship centre, i.e.
   * in the direction (cx, cy) from origin. The required rotation is π/2 + α
   * where α = atan2(cy, cx). Only used for rendering; snap geometry always
   * uses buildVertices.
   */
  static buildCustomVertices(
    verts: ReadonlyArray<readonly [number, number]>,
    sideLengthPx: number,
    cx: number,
    cy: number,
  ): Array<{ x: number; y: number }> {
    const dist = Math.hypot(cx, cy);
    const α = dist > 0.5 ? Math.atan2(cy, cx) : -Math.PI / 2;
    const θ = Math.PI / 2 + α;
    const cos = Math.cos(θ);
    const sin = Math.sin(θ);
    return verts.map(([ux, uy]) => {
      const sx = ux * sideLengthPx;
      const sy = uy * sideLengthPx;
      return { x: cx + sx * cos - sy * sin, y: cy + sx * sin + sy * cos };
    });
  }

  static buildSides(
    vertices: Array<{ x: number; y: number }>,
    cx: number,
    cy: number,
    attachmentSideIndices: number[] | null,
    ownSideIndex: number | null,
    occupiedSideIndices: Set<number>,
  ): SideData[] {
    const N = vertices.length;
    return Array.from({ length: N }, (_, i) => {
      const v0 = vertices[i]!;
      const v1 = vertices[(i + 1) % N]!;
      const midX = (v0.x + v1.x) / 2;
      const midY = (v0.y + v1.y) / 2;
      const normalAngle = Math.atan2(midY - cy, midX - cx);
      const isParentSide = i === ownSideIndex;
      const inList = attachmentSideIndices === null || attachmentSideIndices.includes(i);
      return {
        index: i,
        midX, midY,
        normalAngle,
        isAttachmentPoint: !isParentSide && inList,
        isOccupied: occupiedSideIndices.has(i),
      };
    });
  }

  // ── Full geometry derivation ────────────────────────────────────────────────

  /**
   * Walk the placed-module tree and derive world-space geometry for every module.
   * The core sits at (0, 0) with rotation 0. All other positions are computed
   * from their parent's geometry via the snap-alignment formula.
   */
  static deriveAllGeometries(
    modules: readonly PlacedSolarModule[],
    defs: ReadonlyMap<string, SolarModuleDefinition>,
    coreSideCount: number,
  ): Map<string, ModuleGeometry> {
    // Pre-compute which sides of each module are occupied by children
    const occupiedSides = new Map<string, Set<number>>();
    for (const m of modules) {
      if (m.parentPlacedId !== null && m.parentSideIndex !== null) {
        let s = occupiedSides.get(m.parentPlacedId);
        if (!s) { s = new Set(); occupiedSides.set(m.parentPlacedId, s); }
        s.add(m.parentSideIndex);
      }
    }

    const byId = new Map(modules.map(m => [m.placedId, m]));
    const result = new Map<string, ModuleGeometry>();

    // BFS: roots first, then their children — guarantees parents are ready before children
    const queue: string[] = modules
      .filter(m => m.parentPlacedId === null)
      .map(m => m.placedId);

    while (queue.length > 0) {
      const placedId = queue.shift()!;
      const placed = byId.get(placedId);
      if (!placed) continue;
      const def = defs.get(placed.moduleDefId);
      if (!def) continue;

      const sides = def.type === "core" ? coreSideCount : def.shape.sides;
      const sideLengthPx = def.shape.sideLengthPx;

      let worldX: number, worldY: number, rotationRad: number;

      if (placed.parentPlacedId === null) {
        worldX = 0;
        worldY = 0;
        rotationRad = 0;
      } else {
        const parentGeom = result.get(placed.parentPlacedId);
        if (!parentGeom) continue; // should never happen in a valid tree
        const parentSide = parentGeom.sides[placed.parentSideIndex!];
        if (!parentSide) continue;
        const α = parentSide.normalAngle;
        const a = GeometryEngine.apothem(sides, sideLengthPx);
        worldX = parentSide.midX + a * Math.cos(α);
        worldY = parentSide.midY + a * Math.sin(α);
        const j = placed.ownSideIndex!;
        rotationRad = α + Math.PI - Math.PI / sides - j * ((2 * Math.PI) / sides);
      }

      const vertices = GeometryEngine.buildVertices(sides, sideLengthPx, worldX, worldY, rotationRad);
      const occupied = occupiedSides.get(placedId) ?? new Set<number>();
      const sideData = GeometryEngine.buildSides(
        vertices, worldX, worldY,
        def.shape.attachmentSideIndices,
        placed.ownSideIndex,
        occupied,
      );

      result.set(placedId, { placedId, worldX, worldY, rotationRad, vertices, sides: sideData });

      // Enqueue children
      for (const m of modules) {
        if (m.parentPlacedId === placedId) queue.push(m.placedId);
      }
    }

    return result;
  }

  // ── Snap-point queries ──────────────────────────────────────────────────────

  /** Return all open, unoccupied attachment sides across the whole ship. */
  static getOpenSnapPoints(
    geometries: Map<string, ModuleGeometry>,
    modules: readonly PlacedSolarModule[],
    defs: ReadonlyMap<string, SolarModuleDefinition>,
  ): SolarSnapPoint[] {
    const snapPoints: SolarSnapPoint[] = [];
    for (const [placedId, geom] of geometries) {
      const placed = modules.find(m => m.placedId === placedId);
      if (!placed) continue;
      const def = defs.get(placed.moduleDefId);
      if (!def) continue;
      for (const side of geom.sides) {
        if (side.isAttachmentPoint && !side.isOccupied) {
          snapPoints.push({
            ownerPlacedId: placedId,
            sideIndex: side.index,
            worldX: side.midX,
            worldY: side.midY,
            normalAngle: side.normalAngle,
            sizeClass: def.sizeClass,
          });
        }
      }
    }
    return snapPoints;
  }

  // ── Child placement math ────────────────────────────────────────────────────

  /**
   * Given a snap point on a parent module and a definition for the module being
   * placed, compute the world position, rotation, and connecting side index for
   * the child. Returns null if the size classes don't match.
   */
  static computeSnapTransform(
    draggedDef: SolarModuleDefinition,
    snapPoint: SolarSnapPoint,
    coreSideCount: number,
  ): { worldX: number; worldY: number; rotationRad: number; ownSideIndex: number } | null {
    if (draggedDef.sizeClass !== snapPoint.sizeClass) return null;

    const N = draggedDef.type === "core" ? coreSideCount : draggedDef.shape.sides;
    const S = draggedDef.shape.sideLengthPx;
    const α = snapPoint.normalAngle;
    const a = GeometryEngine.apothem(N, S);
    const step = (2 * Math.PI) / N;

    const worldX = snapPoint.worldX + a * Math.cos(α);
    const worldY = snapPoint.worldY + a * Math.sin(α);

    // j: connecting side of the dragged module — chosen to minimise rotation
    const rawJ = (α + Math.PI - Math.PI / N) / step;
    const j = ((Math.round(rawJ) % N) + N) % N;
    const rotationRad = α + Math.PI - Math.PI / N - j * step;

    return { worldX, worldY, rotationRad, ownSideIndex: j };
  }

  /**
   * Find the nearest valid snap target for a module being dragged at (cursorX, cursorY).
   * Returns null when no snap point is within SNAP_THRESHOLD_PX or size class mismatches
   * all candidates.
   */
  static findNearestSnap(
    cursorX: number,
    cursorY: number,
    draggedDef: SolarModuleDefinition,
    snapPoints: SolarSnapPoint[],
    coreSideCount: number,
  ): {
    snapPoint: SolarSnapPoint;
    transform: { worldX: number; worldY: number; rotationRad: number; ownSideIndex: number };
  } | null {
    let best: {
      snapPoint: SolarSnapPoint;
      transform: { worldX: number; worldY: number; rotationRad: number; ownSideIndex: number };
      dist: number;
    } | null = null;

    for (const sp of snapPoints) {
      const transform = GeometryEngine.computeSnapTransform(draggedDef, sp, coreSideCount);
      if (!transform) continue;
      const dist = Math.hypot(cursorX - transform.worldX, cursorY - transform.worldY);
      if (dist < GeometryEngine.SNAP_THRESHOLD_PX && (best === null || dist < best.dist)) {
        best = { snapPoint: sp, transform, dist };
      }
    }

    return best ? { snapPoint: best.snapPoint, transform: best.transform } : null;
  }
}
