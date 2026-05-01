/**
 * LocationManager — NPC interaction, shop access, and trade transactions for
 * the docked station experience.
 *
 * Combines LocationRegistry, NPCRegistry, and ShopRegistry to provide a
 * unified API for the StationUI state machine.
 *
 * Responsibilities
 * ────────────────
 * • Query which NPCs are present at a location.
 * • Manage a single active NPC dialogue session (greeting → farewell/shop →
 *   closed). The "shop" option only appears when the location carries at least
 *   one shop.
 * • Expose the combined item list for all shops at a location.
 * • Validate and record purchase/sell transactions in terms of credit balance
 *   changes — the caller (StationUI) owns the credit balance and passes it in
 *   for each operation.
 *
 * No Pixi dependency — fully unit-testable.
 *
 * NPC dialogue flow
 * ──────────────────
 *   startNPCInteraction(npc, locationId)
 *     → phase: "greeting", message: npc.dialogueGreeting,
 *       options: ["continue", ("shop" if location has shops), "close"]
 *
 *   selectDialogueOption("continue")
 *     → phase: "farewell", message: npc.dialogueIdle,
 *       options: ["close"]
 *
 *   selectDialogueOption("shop")
 *     → transitionTo: "shop" (caller opens shop screen)
 *
 *   selectDialogueOption("close")
 *     → transitionTo: "closed" (dialogue dismissed)
 */

import { LocationRegistry } from "../game/data/LocationRegistry";
import { NPCRegistry } from "../game/data/NPCRegistry";
import { ShopRegistry } from "../game/data/ShopRegistry";
import type { NPCDefinition } from "../game/data/NPCRegistry";
import type { ShopItem } from "../game/data/ShopRegistry";

// Re-export so callers can import from one place.
export type { NPCDefinition, ShopItem };

// ── Dialogue types ────────────────────────────────────────────────────────────

/** Options available to the player during an NPC dialogue. */
export type DialogueOption = "continue" | "shop" | "close";

/** The current phase of an NPC dialogue session. */
export type DialoguePhase = "greeting" | "farewell";

/**
 * Snapshot of the active NPC dialogue state.
 * Immutable value — LocationManager never returns a reference to its internal
 * mutable copy.
 */
export interface NpcDialogueState {
  /** NPC currently engaged in dialogue. */
  npc: NPCDefinition;
  /** Current dialogue phase. */
  phase: DialoguePhase;
  /** The message displayed to the player (greeting or farewell text). */
  message: string;
  /** Which options the player can choose right now. */
  availableOptions: DialogueOption[];
}

// ── Transaction result types ──────────────────────────────────────────────────

/**
 * Result of a purchase attempt.
 *
 * When `success` is `false`, `reason` identifies why the transaction was
 * rejected and `newBalance` is absent (credits unchanged).
 */
export interface PurchaseResult {
  success: boolean;
  /** Credit balance after deducting the purchase price. Present on success. */
  newBalance?: number;
  /** Why the purchase failed. Absent on success. */
  reason?: "insufficient-credits" | "item-not-found";
  /** The item definition, present when the item was found (success or cost failure). */
  item?: ShopItem;
}

/**
 * Result of a sell transaction.
 *
 * The sell price is always `floor(item.priceCredits × 0.5)`.  The manager
 * does not enforce that the player actually owns the item — callers are
 * responsible for tracking carried items.
 */
export interface SellResult {
  success: boolean;
  /** Credits earned from the sale. 0 on failure. */
  creditsEarned: number;
  /** Credit balance after adding the sale proceeds. Present on success. */
  newBalance?: number;
  /** Why the sale failed. Absent on success. */
  reason?: "item-not-found";
}

// ── Dialogue transition result ────────────────────────────────────────────────

/**
 * Returned by `selectDialogueOption`. Tells the caller which screen to show
 * next and provides the updated dialogue snapshot (when applicable).
 */
export interface DialogueTransition {
  /** Destination state for the caller's UI state machine. */
  transitionTo: "farewell" | "shop" | "closed";
  /** Updated dialogue snapshot (undefined when dialogue is closed). */
  dialogueState: NpcDialogueState | undefined;
}

// ── LocationManager ───────────────────────────────────────────────────────────

export class LocationManager {
  /** Active NPC dialogue session. Null when no dialogue is in progress. */
  private activeDialogue: NpcDialogueState | null = null;

  // ── NPC queries ─────────────────────────────────────────────────────────────

  /**
   * Return all NPCs present at the given location (ordered by their position
   * in the location's `npcs` array).
   *
   * Returns an empty array for an unknown location id or a location with no
   * configured NPCs.
   */
  getNPCsAtLocation(locationId: string): NPCDefinition[] {
    const location = LocationRegistry.getLocation(locationId);
    if (!location) return [];
    return location.npcs
      .map((npcId) => NPCRegistry.getNPC(npcId))
      .filter((npc): npc is NPCDefinition => npc !== undefined);
  }

  // ── NPC dialogue ────────────────────────────────────────────────────────────

  /**
   * Start an NPC dialogue session. Sets the internal dialogue state to
   * "greeting" and returns the initial snapshot.
   *
   * The "shop" option appears only when the location carries at least one shop
   * (`location.shops.length > 0`).
   *
   * @param npc         NPC definition (from NPCRegistry).
   * @param locationId  Id of the location where the player is docked.
   */
  startNPCInteraction(npc: NPCDefinition, locationId: string): NpcDialogueState {
    const location = LocationRegistry.getLocation(locationId);
    const locationHasShops = location !== undefined && location.shops.length > 0;

    const options: DialogueOption[] = ["continue"];
    if (locationHasShops) options.push("shop");
    options.push("close");

    this.activeDialogue = {
      npc,
      phase: "greeting",
      message: npc.dialogueGreeting,
      availableOptions: options,
    };

    return this.snapshotDialogue();
  }

  /**
   * Return the current dialogue state snapshot, or `null` when no dialogue
   * is in progress.
   */
  getDialogueState(): NpcDialogueState | undefined {
    return this.activeDialogue !== null ? this.snapshotDialogue() : undefined;
  }

  /**
   * Advance the dialogue based on the player's chosen option.
   *
   *   "continue" → transitions to farewell phase (npc.dialogueIdle message).
   *   "shop"     → leaves dialogue open but signals caller to show the shop.
   *   "close"    → dismisses the dialogue session.
   *
   * Calling this when no dialogue is active returns `transitionTo: "closed"`.
   */
  selectDialogueOption(option: DialogueOption): DialogueTransition {
    if (!this.activeDialogue) {
      return { transitionTo: "closed", dialogueState: undefined };
    }

    const npc = this.activeDialogue.npc;

    switch (option) {
      case "continue": {
        // Advance to farewell phase with idle/farewell message.
        this.activeDialogue = {
          npc,
          phase: "farewell",
          message: npc.dialogueIdle,
          availableOptions: ["close"],
        };
        return { transitionTo: "farewell", dialogueState: this.snapshotDialogue() };
      }

      case "shop": {
        // Caller opens the shop. Dialogue state is unchanged so the player
        // can return to the dialogue after shopping.
        return { transitionTo: "shop", dialogueState: this.snapshotDialogue() };
      }

      case "close": {
        this.activeDialogue = null;
        return { transitionTo: "closed", dialogueState: undefined };
      }
    }
  }

  /**
   * Dismiss the active NPC dialogue (equivalent to choosing "close").
   * No-op when no dialogue is in progress.
   */
  closeDialogue(): void {
    this.activeDialogue = null;
  }

  // ── Shop queries ────────────────────────────────────────────────────────────

  /**
   * Return all items available for purchase at the given location.
   *
   * Aggregates items across every shop listed in `location.shops`. Items may
   * appear from multiple shops if the location hosts more than one.
   *
   * Returns an empty array for an unknown location or a location with no shops.
   */
  getShopInventory(locationId: string): ShopItem[] {
    const location = LocationRegistry.getLocation(locationId);
    if (!location || location.shops.length === 0) return [];

    const items: ShopItem[] = [];
    for (const shopId of location.shops) {
      items.push(...ShopRegistry.getShopItems(shopId));
    }
    return items;
  }

  // ── Transactions ────────────────────────────────────────────────────────────

  /**
   * Validate and record a purchase transaction.
   *
   * @param itemId        The item the player wants to buy.
   * @param playerCredits The player's current credit balance.
   *
   * Returns success + new balance when the item exists and the player can
   * afford it, otherwise returns the relevant failure reason.
   */
  purchaseItem(itemId: string, playerCredits: number): PurchaseResult {
    const item = ShopRegistry.getItem(itemId);
    if (!item) {
      return { success: false, reason: "item-not-found" };
    }
    if (playerCredits < item.priceCredits) {
      return { success: false, reason: "insufficient-credits", item };
    }
    return {
      success: true,
      newBalance: playerCredits - item.priceCredits,
      item,
    };
  }

  /**
   * Validate and record a sell transaction.
   *
   * The sell price is `floor(item.priceCredits × 0.5)`. Callers are
   * responsible for ensuring the player actually carries the item.
   *
   * @param itemId        The item the player wants to sell.
   * @param playerCredits The player's current credit balance.
   */
  sellItem(itemId: string, playerCredits: number): SellResult {
    const item = ShopRegistry.getItem(itemId);
    if (!item) {
      return { success: false, creditsEarned: 0, reason: "item-not-found" };
    }
    const creditsEarned = ShopRegistry.getSellPrice(itemId);
    return {
      success: true,
      creditsEarned,
      newBalance: playerCredits + creditsEarned,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** Returns a shallow copy of the active dialogue (never a reference). */
  private snapshotDialogue(): NpcDialogueState {
    // activeDialogue is guaranteed non-null at call sites.
    const d = this.activeDialogue!;
    return {
      npc: d.npc,
      phase: d.phase,
      message: d.message,
      availableOptions: [...d.availableOptions],
    };
  }
}
