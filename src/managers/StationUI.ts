/**
 * StationUI — menu-driven interface state machine for the docked station
 * experience.
 *
 * Encapsulates everything the game loop needs to know about what screen to
 * render and what player actions are currently available when the ship is
 * docked.  No Pixi dependency — the renderer reads the state returned by these
 * methods and draws accordingly.
 *
 * Screen flow
 * ────────────
 *
 *   openDockMenu(location, playerCredits)
 *     └─→ screen: "dock-main"
 *           ├─ selectMenuItem("npc")
 *           │    └─→ screen: "npc-dialogue"  (greeting)
 *           │          ├─ selectDialogueOption("continue")
 *           │          │    └─→ screen: "npc-dialogue"  (farewell)
 *           │          │          └─ selectDialogueOption("close")
 *           │          │               └─→ screen: "dock-main"
 *           │          ├─ selectDialogueOption("shop")
 *           │          │    └─→ screen: "npc-shop"
 *           │          │          ├─ purchaseItem(itemId)
 *           │          │          ├─ sellItem(itemId)
 *           │          │          └─ returnToMainMenu()
 *           │          │               └─→ screen: "dock-main"
 *           │          └─ selectDialogueOption("close")
 *           │               └─→ screen: "dock-main"
 *           ├─ selectMenuItem("shipyard")
 *           │    └─→ screen: "shipyard"
 *           │          └─ returnToMainMenu()
 *           │               └─→ screen: "dock-main"
 *           └─ selectMenuItem("undock")
 *                └─→ undockTriggered: true  (caller calls DockingManager.undock)
 *
 * Credit tracking
 * ───────────────
 * The session state carries `playerCredits`. purchaseItem / sellItem update
 * this balance in-place so the caller always reads the up-to-date amount from
 * `getSessionState().playerCredits`.
 *
 * Dock session persistence
 * ────────────────────────
 * Physical ship state (position, velocity, heading) is owned by DockingManager
 * via its pre-dock snapshot. StationUI owns only UI-layer session state
 * (screen, dialogue, credits). Callers should call closeDockSession() after a
 * successful undock to release internal state.
 *
 * Error handling
 * ──────────────
 * Methods throw `Error("StationUI: no active dock session")` when called
 * before openDockMenu or after closeDockSession. This is intentional — it
 * catches integration bugs early rather than silently producing undefined
 * behaviour.
 */

import type { Location } from "../types/solarsystem";
import {
  LocationManager,
  type NpcDialogueState,
  type NPCDefinition,
  type PurchaseResult,
  type SellResult,
  type ShopItem,
} from "./LocationManager";

// Re-export so callers can import everything from one place.
export type { NpcDialogueState, NPCDefinition, PurchaseResult, SellResult, ShopItem };

// ── Screen type ───────────────────────────────────────────────────────────────

/**
 * Which screen of the docked-station interface is currently active.
 *
 *   "dock-main"    — main hub menu (NPC, Shipyard, Undock options).
 *   "npc-dialogue" — NPC greeting or farewell text with player dialogue choices.
 *   "npc-shop"     — shop item list with buy / sell interactions.
 *   "shipyard"     — shipyard configuration screen (modal overlay).
 */
export type DockScreen = "dock-main" | "npc-dialogue" | "npc-shop" | "shipyard";

// ── Menu option ───────────────────────────────────────────────────────────────

/**
 * A single selectable item in the main dock menu.
 *
 * `available` is `false` when the option exists but cannot be used right now
 * (e.g. "Talk to NPC" when the location has no NPCs, "Shipyard" at an outpost
 * that has no ship-modification facilities).
 */
export interface DockMenuOption {
  id: "npc" | "shipyard" | "undock";
  label: string;
  /** Whether the option is selectable. When false the UI should grey it out. */
  available: boolean;
}

// ── Session state ─────────────────────────────────────────────────────────────

/**
 * Immutable snapshot of the active dock session state.
 *
 * Returned by every mutating method and by `getSessionState()`. The caller
 * should treat this as a value object — do not mutate the fields.
 */
export interface DockSessionState {
  /** Currently displayed screen within the dock interface. */
  screen: DockScreen;
  /** The location the player is docked at. */
  location: Location;
  /** Options shown in the main dock menu (always present regardless of screen). */
  availableMenuOptions: DockMenuOption[];
  /** NPC currently in dialogue. Present when screen is "npc-dialogue" or "npc-shop". */
  activeNpc?: NPCDefinition;
  /** Current NPC dialogue snapshot. Present when screen is "npc-dialogue". */
  dialogue?: NpcDialogueState;
  /** Items available in the shop. Present when screen is "npc-shop". */
  shopItems?: ShopItem[];
  /**
   * Player credit balance at this point in the dock session.
   * Updated immediately when purchaseItem / sellItem succeed.
   */
  playerCredits: number;
  /**
   * True on the frame after the player selects "Undock".
   *
   * The caller is responsible for:
   *   1. Calling `DockingManager.undock(session)` to restore the ship state.
   *   2. Switching to the solar-system combat screen.
   *   3. Calling `StationUI.closeDockSession()` to release internal state.
   */
  undockTriggered: boolean;
}

// ── StationUI ─────────────────────────────────────────────────────────────────

export class StationUI {
  private readonly locationManager: LocationManager;
  private sessionState: DockSessionState | null = null;

  /**
   * @param locationManager  Optional injected LocationManager for testing.
   *                         Defaults to a fresh instance.
   */
  constructor(locationManager?: LocationManager) {
    this.locationManager = locationManager ?? new LocationManager();
  }

  // ── Session lifecycle ───────────────────────────────────────────────────────

  /**
   * Enter the docked station UI for `location`.
   *
   * Builds the main menu option list based on what the location provides:
   *   • "Talk to NPC" — available when `location.npcs` is non-empty.
   *   • "Visit Shipyard" — available when `location.type === "station"`.
   *   • "Undock" — always available.
   *
   * @param location      The location the player has just docked at.
   * @param playerCredits The player's credit balance at the start of the session.
   * @returns The initial dock session state with screen set to "dock-main".
   */
  openDockMenu(location: Location, playerCredits: number): DockSessionState {
    const npcs = this.locationManager.getNPCsAtLocation(location.id);
    const hasNPCs = npcs.length > 0;
    const hasShipyard = location.type === "station";

    const menuOptions: DockMenuOption[] = [
      { id: "npc", label: "Talk to NPC", available: hasNPCs },
      { id: "shipyard", label: "Visit Shipyard", available: hasShipyard },
      { id: "undock", label: "Undock", available: true },
    ];

    this.sessionState = {
      screen: "dock-main",
      location,
      availableMenuOptions: menuOptions,
      playerCredits,
      undockTriggered: false,
    };

    return this.snapshot();
  }

  /**
   * Handle a player selection from the main dock menu.
   *
   *   "npc"      — starts a dialogue with the first NPC at the location and
   *                transitions to the "npc-dialogue" screen.
   *   "shipyard" — transitions to the "shipyard" screen.
   *   "undock"   — sets `undockTriggered: true` in the session state. The
   *                caller must call `DockingManager.undock()` and then
   *                `closeDockSession()`.
   *
   * No-op when the selected option is not available (e.g. "npc" at a location
   * without NPCs). The returned state reflects the unchanged screen.
   *
   * @throws Error when called with no active dock session.
   */
  selectMenuItem(selection: "npc" | "shipyard" | "undock"): DockSessionState {
    this.requireSession();

    switch (selection) {
      case "npc": {
        const npcs = this.locationManager.getNPCsAtLocation(
          this.sessionState!.location.id,
        );
        if (npcs.length === 0) break; // option not available — no-op

        const npc = npcs[0]!;
        const dialogue = this.locationManager.startNPCInteraction(
          npc,
          this.sessionState!.location.id,
        );
        this.sessionState = {
          ...this.sessionState!,
          screen: "npc-dialogue",
          activeNpc: npc,
          dialogue,
        };
        break;
      }

      case "shipyard": {
        this.sessionState = {
          ...this.sessionState!,
          screen: "shipyard",
        };
        break;
      }

      case "undock": {
        // Signal the caller to trigger DockingManager.undock().
        this.sessionState = {
          ...this.sessionState!,
          undockTriggered: true,
        };
        break;
      }
    }

    return this.snapshot();
  }

  /**
   * Handle a player choice in the NPC dialogue screen.
   *
   *   "continue" — advances to the farewell phase (remains on "npc-dialogue").
   *   "shop"     — transitions to the "npc-shop" screen.
   *   "close"    — dismisses the dialogue and returns to "dock-main".
   *
   * @throws Error when called with no active dock session.
   */
  selectDialogueOption(option: "continue" | "shop" | "close"): DockSessionState {
    this.requireSession();

    const { transitionTo, dialogueState } =
      this.locationManager.selectDialogueOption(option);

    switch (transitionTo) {
      case "farewell": {
        this.sessionState = {
          ...this.sessionState!,
          screen: "npc-dialogue",
          dialogue: dialogueState ?? undefined,
        };
        break;
      }

      case "shop": {
        const shopItems = this.locationManager.getShopInventory(
          this.sessionState!.location.id,
        );
        this.sessionState = {
          ...this.sessionState!,
          screen: "npc-shop",
          shopItems,
        };
        break;
      }

      case "closed": {
        // Return to dock-main, clearing dialogue state.
        this.sessionState = {
          ...this.sessionState!,
          screen: "dock-main",
          activeNpc: undefined,
          dialogue: undefined,
        };
        break;
      }
    }

    return this.snapshot();
  }

  // ── Shop transactions ───────────────────────────────────────────────────────

  /**
   * Purchase an item from the current shop.
   *
   * On success the session's `playerCredits` balance is reduced by the item
   * price. The caller may read the updated balance from `getSessionState()`.
   *
   * @throws Error when called with no active dock session.
   */
  purchaseItem(itemId: string): PurchaseResult {
    this.requireSession();

    const result = this.locationManager.purchaseItem(
      itemId,
      this.sessionState!.playerCredits,
    );

    if (result.success && result.newBalance !== undefined) {
      this.sessionState = {
        ...this.sessionState!,
        playerCredits: result.newBalance,
      };
    }

    return result;
  }

  /**
   * Sell an item to the NPC shop.
   *
   * On success the session's `playerCredits` balance is increased by the sell
   * price (`floor(item.priceCredits × 0.5)`). The caller may read the updated
   * balance from `getSessionState()`.
   *
   * @throws Error when called with no active dock session.
   */
  sellItem(itemId: string): SellResult {
    this.requireSession();

    const result = this.locationManager.sellItem(
      itemId,
      this.sessionState!.playerCredits,
    );

    if (result.success && result.newBalance !== undefined) {
      this.sessionState = {
        ...this.sessionState!,
        playerCredits: result.newBalance,
      };
    }

    return result;
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  /**
   * Return to the main dock menu from any sub-screen.
   *
   * Closes the active NPC dialogue (if any) and clears shop / dialogue state.
   *
   * @throws Error when called with no active dock session.
   */
  returnToMainMenu(): DockSessionState {
    this.requireSession();

    this.locationManager.closeDialogue();
    this.sessionState = {
      ...this.sessionState!,
      screen: "dock-main",
      activeNpc: undefined,
      dialogue: undefined,
      shopItems: undefined,
    };

    return this.snapshot();
  }

  // ── State accessors ─────────────────────────────────────────────────────────

  /**
   * Read-only snapshot of the current dock session state.
   * Returns `null` when no session is active.
   */
  getSessionState(): DockSessionState | null {
    return this.sessionState !== null ? this.snapshot() : null;
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  /**
   * Release all internal session state.
   *
   * Call this after a successful `DockingManager.undock()` has been processed
   * by the game loop.  Subsequent method calls will throw until the next
   * `openDockMenu()` invocation.
   */
  closeDockSession(): void {
    this.locationManager.closeDialogue();
    this.sessionState = null;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private requireSession(): void {
    if (this.sessionState === null) {
      throw new Error("StationUI: no active dock session");
    }
  }

  /** Returns a shallow copy of the session state (value object). */
  private snapshot(): DockSessionState {
    const s = this.sessionState!;
    return {
      screen: s.screen,
      location: s.location,
      availableMenuOptions: s.availableMenuOptions.map((o) => ({ ...o })),
      activeNpc: s.activeNpc,
      dialogue: s.dialogue
        ? {
            ...s.dialogue,
            availableOptions: [...s.dialogue.availableOptions],
          }
        : undefined,
      shopItems: s.shopItems ? [...s.shopItems] : undefined,
      playerCredits: s.playerCredits,
      undockTriggered: s.undockTriggered,
    };
  }
}
