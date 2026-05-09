/**
 * ShipBuilderManager — session state for the solar-system ship builder.
 *
 * Pure logic; no Pixi or DOM dependency. Manages palette selection, pointer
 * state, and delegates geometry/budget work to GeometryEngine/BlueprintEngine.
 *
 * Coordinate convention:
 *   - Ship canvas occupies x: 0..800, y: 0..720 in screen space.
 *   - Canvas centre (screen 400, 360) maps to world origin (0, 0) when pan=0.
 *   - screenX = worldX × zoom + CANVAS_CX + panX
 */

import type {
  SolarModuleDefinition,
  SolarShipBlueprint,
  SolarShipBuilderRenderData,
  SolarBuilderGhostData,
  SolarBuilderPaletteItem,
  SolarBuilderContextMenu,
  SavedBlueprintSummary,
  ShipClass,
  CorePickerItem,
} from "../types/solarShipBuilder";
import { SolarModuleRegistry } from "../game/data/SolarModuleRegistry";
import { BlueprintEngine } from "../game/shipbuilder/BlueprintEngine";
import { GeometryEngine } from "../game/shipbuilder/GeometryEngine";

/** Inventory change emitted when a module is placed or removed from the ship. */
export interface InventoryDelta {
  readonly moduleDefId: string;
  readonly delta: number; // +1 = returned to inventory, -1 = consumed from inventory
}

export class ShipBuilderManager {
  private engine: BlueprintEngine | null = null;
  private selectedDefId: string | null = null;
  private cursorX = 400;
  private cursorY = 360;
  private panX = 0;
  private panY = 0;
  private zoom = 1.0;
  private statusMsg: string | null = null;
  private statusMs = 0;
  private contextMenu: SolarBuilderContextMenu | null = null;
  private corePicker: ReadonlyArray<CorePickerItem> | null = null;
  private corePickerScrollOffset = 0;
  private corePickerSearch = "";
  private corePickerShowAll = false;
  private renameMode = false;
  private renameBuf = "";

  static readonly LEFT_PANEL_W = 800;
  static readonly CANVAS_CX = 400;
  static readonly CANVAS_CY = 360;

  private static readonly TILE_H = 36;
  private static readonly TILE_START_Y = 120;

  isOpen(): boolean {
    return this.engine !== null;
  }

  open(coreDefId: string, coreSideCount: number, existing?: SolarShipBlueprint): void {
    this.engine = existing
      ? BlueprintEngine.load(existing)
      : BlueprintEngine.create(coreDefId, coreSideCount);
    this.selectedDefId = null;
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
    this.statusMsg = null;
    this.statusMs = 0;
    this.contextMenu = null;
  }

  close(): SolarShipBlueprint | null {
    const bp = this.engine?.getBlueprint() ?? null;
    this.engine = null;
    this.selectedDefId = null;
    this.contextMenu = null;
    this.corePicker = null;
    this.renameMode = false;
    this.renameBuf = "";
    return bp;
  }

  // ── Core picker ─────────────────────────────────────────────────────────

  openCorePicker(inventory: ReadonlyMap<string, number>): void {
    this.contextMenu = null;
    this.corePickerScrollOffset = 0;
    this.corePickerSearch = "";
    this.corePickerShowAll = false;
    this.corePicker = SolarModuleRegistry.getCores()
      .map((c): CorePickerItem => ({
        defId: c.id,
        name: c.name,
        sizeClass: c.sizeClass,
        weaponPoints: c.weaponPoints,
        externalPoints: c.externalPoints,
        internalPoints: c.internalPoints,
        quantity: inventory.get(c.id) ?? 0,
      }));
  }

  /** Apply text search + owned-only filter. Returns the visible slice for rendering. */
  getFilteredCorePicker(): ReadonlyArray<CorePickerItem> {
    if (!this.corePicker) return [];
    const term = this.corePickerSearch.toLowerCase();
    return this.corePicker.filter(c =>
      (this.corePickerShowAll || c.quantity > 0) &&
      (!term || c.name.toLowerCase().includes(term))
    );
  }

  typeCorePickerSearch(chars: string): void {
    this.corePickerSearch += chars;
    this.corePickerScrollOffset = 0;
  }

  backspaceCorePickerSearch(): void {
    this.corePickerSearch = this.corePickerSearch.slice(0, -1);
    this.corePickerScrollOffset = 0;
  }

  toggleCorePickerShowAll(): void {
    this.corePickerShowAll = !this.corePickerShowAll;
    this.corePickerScrollOffset = 0;
  }

  getCorePickerSearch(): string { return this.corePickerSearch; }
  getCorePickerShowAll(): boolean { return this.corePickerShowAll; }

  scrollCorePicker(delta: number, maxVisible: number): void {
    const filtered = this.getFilteredCorePicker();
    const max = Math.max(0, filtered.length - maxVisible);
    this.corePickerScrollOffset = Math.max(0, Math.min(max, this.corePickerScrollOffset + delta));
  }

  closeCorePicker(): void {
    this.corePicker = null;
  }

  isCorePicking(): boolean {
    return this.corePicker !== null;
  }

  /** Consume one core from inventory and open builder with it. Returns inventory delta or null if unavailable. */
  selectCore(defId: string, inventory: ReadonlyMap<string, number>): InventoryDelta | null {
    const owned = inventory.get(defId) ?? 0;
    if (owned <= 0) {
      this.setStatus("NO CORE IN INVENTORY");
      return null;
    }
    const def = SolarModuleRegistry.getModule(defId);
    if (!def || def.type !== "core") return null;
    this.corePicker = null;
    this.open(defId, 6);
    this.setStatus("NEW SHIP CREATED");
    return { moduleDefId: defId, delta: -1 };
  }

  // ── Rename mode ──────────────────────────────────────────────────────────

  enterRenameMode(): void {
    if (!this.engine) return;
    this.renameBuf = this.engine.getBlueprint().name;
    this.renameMode = true;
  }

  /** Zoom in/out. delta > 0 = zoom in, < 0 = zoom out. */
  adjustZoom(delta: number, screenX?: number, screenY?: number): void {
    const prevZoom = this.zoom;
    const newZoom = Math.max(0.2, Math.min(5.0, this.zoom + delta));
    if (newZoom === prevZoom) return;
    // Zoom toward the cursor position (screen space), if provided.
    if (screenX !== undefined && screenY !== undefined) {
      const cx = ShipBuilderManager.CANVAS_CX;
      const cy = ShipBuilderManager.CANVAS_CY;
      const worldX = (screenX - cx - this.panX) / prevZoom;
      const worldY = (screenY - cy - this.panY) / prevZoom;
      this.panX = screenX - cx - worldX * newZoom;
      this.panY = screenY - cy - worldY * newZoom;
    }
    this.zoom = newZoom;
  }

  setZoomLevel(zoom: number): void {
    this.zoom = Math.max(0.2, Math.min(5.0, zoom));
  }

  getZoom(): number { return this.zoom; }

  isRenaming(): boolean {
    return this.renameMode;
  }

  handleRenameInput(typedText: string, backspace: boolean, confirm: boolean, cancel: boolean): void {
    if (!this.renameMode) return;
    if (cancel) {
      this.renameMode = false;
      this.renameBuf = "";
      return;
    }
    if (confirm) {
      const name = this.renameBuf.trim();
      if (name.length > 0) this.renameBlueprint(name);
      this.renameMode = false;
      this.renameBuf = "";
      return;
    }
    if (backspace) {
      this.renameBuf = this.renameBuf.slice(0, -1);
    }
    if (typedText) {
      this.renameBuf = (this.renameBuf + typedText).slice(0, 40);
    }
  }

  getBlueprint(): SolarShipBlueprint | null {
    return this.engine?.getBlueprint() ?? null;
  }

  onPointerMove(screenX: number, screenY: number): void {
    this.cursorX = screenX;
    this.cursorY = screenY;
  }

  /**
   * Handle left-click. Returns an InventoryDelta when a module is placed
   * (caller must decrement the corresponding inventory slot).
   */
  onPointerDown(screenX: number, screenY: number, inventory: ReadonlyMap<string, number>): InventoryDelta | null {
    if (!this.engine) return null;

    // Clicking anywhere clears any open context menu
    this.contextMenu = null;

    if (screenX >= ShipBuilderManager.LEFT_PANEL_W) {
      this.handlePaletteClick(screenY, inventory);
      return null;
    }

    // Left panel: place selected module at snap point
    if (!this.selectedDefId) return null;
    const def = SolarModuleRegistry.getModule(this.selectedDefId);
    if (!def) return null;

    // Inventory check
    const owned = inventory.get(def.id) ?? 0;
    if (owned <= 0) {
      this.setStatus("NOT IN INVENTORY");
      return null;
    }

    const snap = this.computeSnap(def);
    if (!snap) return null;

    const result = this.engine.canPlace(def, snap.snapPoint.ownerPlacedId, snap.snapPoint.sideIndex);
    if (!result.ok) {
      this.setStatus(result.reason.toUpperCase().replace(/-/g, " "));
      return null;
    }

    this.engine.placeModule(
      def,
      snap.snapPoint.ownerPlacedId,
      snap.snapPoint.sideIndex,
      snap.transform.ownSideIndex,
    );

    // Deselect if that was the last unit
    if (owned - 1 <= 0) this.selectedDefId = null;

    this.setStatus("PLACED");
    return { moduleDefId: def.id, delta: -1 };
  }

  /**
   * Handle right-click. Returns InventoryDeltas for every module removed
   * (the clicked module and all its descendants). Empty array if no removal occurred.
   */
  onRightClick(screenX: number, screenY: number): InventoryDelta[] {
    if (!this.engine) return [];

    // Right panel: open context menu for palette item
    if (screenX >= ShipBuilderManager.LEFT_PANEL_W) {
      this.contextMenu = null; // clear old
      const sizeClass = this.engine.getBlueprint().sizeClass;
      const idx = Math.floor(
        (screenY - ShipBuilderManager.TILE_START_Y) / ShipBuilderManager.TILE_H,
      );
      if (idx >= 0) {
        const items = this.buildPaletteItems(sizeClass);
        const item = items[idx];
        if (item) {
          this.contextMenu = {
            defId: item.defId,
            name: item.name,
            moduleType: item.moduleType,
            screenX,
            screenY,
            options: ["info", "sell", "trash"],
          };
        }
      }
      return [];
    }

    // Left panel with palette item selected:
    // - over a placed part → remove it, keep selection
    // - over blank space  → deselect
    const worldPos = this.screenToWorld(screenX, screenY);
    const placedId = this.findModuleAtWorld(worldPos.x, worldPos.y);
    if (this.selectedDefId) {
      if (placedId && placedId !== "core") {
        const deltas = this.collectSubtreeDeltas(placedId);
        this.engine.removeModule(placedId);
        this.setStatus("REMOVED");
        return deltas;
      } else {
        // Blank space → deselect without removing anything
        this.selectedDefId = null;
        this.contextMenu = null;
      }
      return [];
    }

    // No selection — try to remove module under cursor
    if (placedId && placedId !== "core") {
      const deltas = this.collectSubtreeDeltas(placedId);
      this.engine.removeModule(placedId);
      this.setStatus("REMOVED");
      return deltas;
    }
    return [];
  }

  /** Collect +1 inventory deltas for a placed module and all its descendants. */
  private collectSubtreeDeltas(rootPlacedId: string): InventoryDelta[] {
    const blueprint = this.engine!.getBlueprint();
    const result: InventoryDelta[] = [];
    const queue = [rootPlacedId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const placed = blueprint.modules.find((m) => m.placedId === id);
      if (placed) {
        result.push({ moduleDefId: placed.moduleDefId, delta: +1 });
        for (const m of blueprint.modules) {
          if (m.parentPlacedId === id) queue.push(m.placedId);
        }
      }
    }
    return result;
  }

  /** Handle context-menu option selection. Returns InventoryDelta when "trash" removes 1 unit. */
  onContextMenuSelect(
    option: "info" | "sell" | "trash",
  ): { action: "sell" | "trash"; defId: string } | null {
    const menu = this.contextMenu;
    this.contextMenu = null;
    if (!menu) return null;
    if (option === "info") {
      this.setStatus(menu.name.toUpperCase());
      return null;
    }
    return { action: option, defId: menu.defId };
  }

  dismissContextMenu(): void {
    this.contextMenu = null;
  }

  getContextMenu(): SolarBuilderContextMenu | null {
    return this.contextMenu;
  }

  tick(deltaMs: number): void {
    if (this.statusMs > 0) {
      this.statusMs = Math.max(0, this.statusMs - deltaMs);
      if (this.statusMs === 0) this.statusMsg = null;
    }
  }

  changeCoreSides(newCount: number): void {
    if (!this.engine) return;
    const bp = this.engine.getBlueprint();
    const clamped = Math.max(3, Math.min(20, newCount));
    if (clamped === bp.coreSideCount) return;
    this.engine = BlueprintEngine.create(bp.modules[0]!.moduleDefId, clamped);
    this.selectedDefId = null;
    this.setStatus(`CORE: ${clamped} SIDES`);
  }

  getCoreSideCount(): number {
    return this.engine?.getBlueprint().coreSideCount ?? 6;
  }

  renameBlueprint(newName: string): void {
    this.engine?.rename(newName);
    // Invalidate the status so the new name is visible immediately
    this.setStatus(`RENAMED: ${newName.trim().toUpperCase()}`);
  }

  getRenderData(
    inventory: ReadonlyMap<string, number>,
    playerCredits: number,
    shopEntries?: ReadonlyArray<{ moduleDefId: string; stock: number; price: number }>,
    savedBlueprints?: ReadonlyArray<SavedBlueprintSummary>,
  ): SolarShipBuilderRenderData | null {
    if (!this.engine) return null;
    const blueprint = this.engine.getBlueprint();
    const defs = SolarModuleRegistry.getModuleMap();
    const geometries = GeometryEngine.deriveAllGeometries(
      blueprint.modules,
      defs,
      blueprint.coreSideCount,
    );

    const modules = blueprint.modules.flatMap((m) => {
      const geom = geometries.get(m.placedId);
      const def = defs.get(m.moduleDefId);
      if (!geom || !def) return [];
      const vertices = def.shape.verts
        ? GeometryEngine.buildCustomVertices(
            def.shape.verts, def.shape.sideLengthPx, geom.worldX, geom.worldY,
            geom.rotationRad, m.ownSideIndex ?? undefined, def.shape.sides,
          )
        : geom.vertices;
      return [{ placedId: m.placedId, vertices, worldX: geom.worldX, worldY: geom.worldY, moduleType: def.type, partKind: def.partKind, grade: def.sizeClass }];
    });

    const openSnaps = GeometryEngine.getOpenSnapPoints(geometries, blueprint.modules, defs);
    const selectedDef = this.selectedDefId ? defs.get(this.selectedDefId) : undefined;

    const snapPoints = openSnaps.map((sp) => ({
      worldX: sp.worldX,
      worldY: sp.worldY,
      isActive: !!selectedDef && selectedDef.sizeClass === sp.sizeClass,
    }));

    let ghost: SolarBuilderGhostData | null = null;
    if (selectedDef && this.cursorX <= ShipBuilderManager.LEFT_PANEL_W) {
      const owned = inventory.get(selectedDef.id) ?? 0;
      if (owned > 0) {
        const snapResult = this.computeSnap(selectedDef);
        if (snapResult) {
          const { worldX, worldY, rotationRad } = snapResult.transform;
          const N = selectedDef.type === "core" ? blueprint.coreSideCount : selectedDef.shape.sides;
          const vertices = GeometryEngine.buildVertices(N, selectedDef.shape.sideLengthPx, worldX, worldY, rotationRad);
          ghost = { vertices, moduleType: selectedDef.type, partKind: selectedDef.partKind, grade: selectedDef.sizeClass, isSnapped: true };
        } else {
          const worldPos = this.screenToWorld(this.cursorX, this.cursorY);
          const N = selectedDef.type === "core" ? blueprint.coreSideCount : selectedDef.shape.sides;
          const vertices = GeometryEngine.buildVertices(N, selectedDef.shape.sideLengthPx, worldPos.x, worldPos.y, 0);
          ghost = { vertices, moduleType: selectedDef.type, partKind: selectedDef.partKind, grade: selectedDef.sizeClass, isSnapped: false };
        }
      }
    }

    return {
      modules,
      snapPoints,
      ghost,
      budget: this.engine.getBudget(),
      palette: this.buildPalette(blueprint.sizeClass, inventory, shopEntries),
      statusMsg: this.statusMsg,
      shipName: blueprint.name,
      panX: this.panX,
      panY: this.panY,
      zoom: this.zoom,
      contextMenu: this.contextMenu,
      playerCredits,
      coreSideCount: blueprint.coreSideCount,
      savedBlueprints: savedBlueprints ?? [],
      corePicker: this.corePicker ? this.getFilteredCorePicker() : null,
      corePickerScrollOffset: this.corePickerScrollOffset,
      corePickerSearch: this.corePickerSearch,
      corePickerShowAll: this.corePickerShowAll,
      renameMode: this.renameMode,
      renameBuf: this.renameBuf,
    };
  }

  private handlePaletteClick(screenY: number, inventory: ReadonlyMap<string, number>): void {
    const idx = Math.floor(
      (screenY - ShipBuilderManager.TILE_START_Y) / ShipBuilderManager.TILE_H,
    );
    if (idx < 0) return;
    const sizeClass = this.engine?.getBlueprint().sizeClass;
    if (sizeClass === undefined) return;
    const items = this.buildPaletteItems(sizeClass);
    const item = items[idx];
    if (!item) return;
    const owned = inventory.get(item.defId) ?? 0;
    if (owned <= 0) {
      this.setStatus("NOT OWNED — BUY FROM SHOP");
      return;
    }
    this.selectedDefId = this.selectedDefId === item.defId ? null : item.defId;
  }

  private buildPaletteItems(sizeClass: ShipClass): Array<{ defId: string; name: string; moduleType: SolarModuleDefinition["type"] }> {
    return SolarModuleRegistry.getAllModules()
      .filter((d) => d.type !== "core" && d.sizeClass === sizeClass)
      .map((d) => ({ defId: d.id, name: d.name, moduleType: d.type }));
  }

  private buildPalette(
    sizeClass: ShipClass,
    inventory: ReadonlyMap<string, number>,
    shopEntries?: ReadonlyArray<{ moduleDefId: string; stock: number; price: number }>,
  ): SolarBuilderPaletteItem[] {
    const shopMap = new Map(shopEntries?.map((e) => [e.moduleDefId, e]) ?? []);
    return SolarModuleRegistry.getAllModules()
      .filter((d) => d.type !== "core" && d.sizeClass === sizeClass)
      .map((d) => {
        const shopEntry = shopMap.get(d.id);
        return {
          defId: d.id,
          name: d.name,
          moduleType: d.type,
          sizeClass: d.sizeClass,
          isSelected: d.id === this.selectedDefId,
          quantity: inventory.get(d.id) ?? 0,
          shopStock: shopEntry?.stock ?? 0,
          shopPrice: shopEntry?.price ?? 0,
        };
      });
  }

  private computeSnap(def: SolarModuleDefinition) {
    if (!this.engine) return null;
    const blueprint = this.engine.getBlueprint();
    const defs = SolarModuleRegistry.getModuleMap();
    const geometries = GeometryEngine.deriveAllGeometries(blueprint.modules, defs, blueprint.coreSideCount);
    const openSnaps = GeometryEngine.getOpenSnapPoints(geometries, blueprint.modules, defs);
    const world = this.screenToWorld(this.cursorX, this.cursorY);
    return GeometryEngine.findNearestSnap(world.x, world.y, def, openSnaps, blueprint.coreSideCount);
  }

  private findModuleAtWorld(worldX: number, worldY: number): string | null {
    if (!this.engine) return null;
    const blueprint = this.engine.getBlueprint();
    const defs = SolarModuleRegistry.getModuleMap();
    const geometries = GeometryEngine.deriveAllGeometries(blueprint.modules, defs, blueprint.coreSideCount);
    let nearest: string | null = null;
    let nearestDist = Infinity;
    for (const [placedId, geom] of geometries) {
      const m = blueprint.modules.find((m) => m.placedId === placedId);
      const def = m ? defs.get(m.moduleDefId) : undefined;
      if (!def) continue;
      const N = def.type === "core" ? blueprint.coreSideCount : def.shape.sides;
      const r = GeometryEngine.circumradius(N, def.shape.sideLengthPx);
      const dist = Math.hypot(worldX - geom.worldX, worldY - geom.worldY);
      if (dist < r && dist < nearestDist) {
        nearestDist = dist;
        nearest = placedId;
      }
    }
    return nearest;
  }

  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - ShipBuilderManager.CANVAS_CX - this.panX) / this.zoom,
      y: (sy - ShipBuilderManager.CANVAS_CY - this.panY) / this.zoom,
    };
  }

  setStatus(msg: string): void {
    this.statusMsg = msg;
    this.statusMs = 1500;
  }
}
