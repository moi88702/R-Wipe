/**
 * Tests for LocationManager
 *
 * Coverage strategy (integration-first TDD)
 * ─────────────────────────────────────────
 * LocationManager is the primary entry point for the docked-station NPC and
 * shop experience.  Tests assert observable outcomes (dialogue state, credit
 * balances, item lists) rather than internal implementation steps.
 *
 * LocationRegistry, NPCRegistry, and ShopRegistry are pure data modules —
 * they carry no I/O — so they run for real, consistent with the integration-
 * first principle.
 *
 * Test groups
 * ───────────
 *   getNPCsAtLocation
 *     1.  Known location with NPCs         → correct NPCDefinition objects
 *     2.  Location with multiple NPCs      → all returned in order
 *     3.  Unknown location id              → empty array
 *     4.  All registered locations         → each has ≥1 NPC (data integrity)
 *
 *   startNPCInteraction
 *     5.  NPC at shop-enabled location     → greeting phase, shop option present
 *     6.  NPC at any location              → greeting message equals npc.dialogueGreeting
 *     7.  Location with shops              → "shop" option in availableOptions
 *     8.  No active dialogue before start  → getDialogueState() returns null
 *     9.  After start                      → getDialogueState() matches snapshot
 *
 *   selectDialogueOption — "continue"
 *    10.  Greeting → continue              → farewell phase, message = npc.dialogueIdle
 *    11.  Farewell options                 → only "close" available
 *    12.  transitionTo                     → "farewell"
 *
 *   selectDialogueOption — "shop"
 *    13.  Greeting → shop                  → transitionTo: "shop", dialogue unchanged
 *    14.  Dialogue state preserved after shop transition
 *
 *   selectDialogueOption — "close"
 *    15.  Greeting → close                 → transitionTo: "closed", state null
 *    16.  Farewell → close                 → transitionTo: "closed", state null
 *    17.  getDialogueState() returns null after close
 *
 *   selectDialogueOption — no active dialogue
 *    18.  Called with no session           → transitionTo: "closed"
 *
 *   closeDialogue
 *    19.  Resets active dialogue           → getDialogueState() null
 *    20.  No-op when no dialogue active    → no throw
 *
 *   getShopInventory
 *    21.  Station Alpha                    → non-empty item list
 *    22.  Unknown location                 → empty array
 *    23.  Location with no shops           → empty array
 *    24.  Items have required fields       → id, name, category, priceCredits, description
 *
 *   purchaseItem — happy path
 *    25.  Sufficient credits               → success, correct newBalance
 *    26.  Exact credits                    → success (boundary: credits === price)
 *    27.  item field present in result
 *
 *   purchaseItem — unhappy paths
 *    28.  Insufficient credits             → failure, "insufficient-credits"
 *    29.  Unknown item id                  → failure, "item-not-found"
 *    30.  Balance unchanged on failure     → newBalance absent
 *
 *   sellItem — happy path
 *    31.  Known item                       → success, creditsEarned = floor(price/2)
 *    32.  Credits accumulate               → newBalance = playerCredits + earned
 *    33.  Sell price floors fractional half → floor(75/2) = 37
 *
 *   sellItem — unhappy path
 *    34.  Unknown item id                  → failure, creditsEarned 0, "item-not-found"
 */

import { describe, it, expect, beforeEach } from "vitest";
import { LocationManager } from "./LocationManager";

// ── getNPCsAtLocation ─────────────────────────────────────────────────────────

describe("LocationManager.getNPCsAtLocation", () => {
  it("returns the correct NPC definitions for a known location", () => {
    // Given: Station Alpha hosts Commander Voss and Trader Halley
    // When: we query its NPCs
    const manager = new LocationManager();
    const npcs = manager.getNPCsAtLocation("station-alpha");

    // Then: both NPCs are returned with correct ids
    expect(npcs).toHaveLength(2);
    const ids = npcs.map((n) => n.id);
    expect(ids).toContain("npc-commander-voss");
    expect(ids).toContain("npc-trader-halley");
  });

  it("returns NPCs in the order they appear in the location definition", () => {
    // Given: Station Alpha lists Commander Voss first, Halley second
    const manager = new LocationManager();
    const npcs = manager.getNPCsAtLocation("station-alpha");

    // Then: the order matches the registry
    expect(npcs[0]!.id).toBe("npc-commander-voss");
    expect(npcs[1]!.id).toBe("npc-trader-halley");
  });

  it("returns an empty array for an unknown location id", () => {
    const manager = new LocationManager();
    expect(manager.getNPCsAtLocation("no-such-location")).toEqual([]);
  });

  it("returns every NPC object with the required fields", () => {
    // Given: any location with NPCs
    const manager = new LocationManager();
    const npcs = manager.getNPCsAtLocation("station-beta");

    // Then: each NPC has all required shape fields
    for (const npc of npcs) {
      expect(typeof npc.id).toBe("string");
      expect(typeof npc.name).toBe("string");
      expect(typeof npc.dialogueGreeting).toBe("string");
      expect(typeof npc.dialogueIdle).toBe("string");
      expect(npc.dialogueGreeting.length).toBeGreaterThan(0);
      expect(npc.dialogueIdle.length).toBeGreaterThan(0);
    }
  });
});

// ── startNPCInteraction ───────────────────────────────────────────────────────

describe("LocationManager.startNPCInteraction", () => {
  it("sets dialogue to greeting phase with the NPC's greeting message", () => {
    // Given: Commander Voss at Station Alpha
    const manager = new LocationManager();
    const npcs = manager.getNPCsAtLocation("station-alpha");
    const voss = npcs.find((n) => n.id === "npc-commander-voss")!;

    // When: we start an interaction
    const state = manager.startNPCInteraction(voss, "station-alpha");

    // Then: greeting phase with correct message
    expect(state.phase).toBe("greeting");
    expect(state.message).toBe(voss.dialogueGreeting);
    expect(state.npc.id).toBe("npc-commander-voss");
  });

  it('includes "shop" option when the location has shops', () => {
    // Given: Station Alpha has shop-tf-alpha
    const manager = new LocationManager();
    const npcs = manager.getNPCsAtLocation("station-alpha");

    const state = manager.startNPCInteraction(npcs[0]!, "station-alpha");

    expect(state.availableOptions).toContain("shop");
  });

  it('always includes "continue" and "close" options', () => {
    const manager = new LocationManager();
    const npcs = manager.getNPCsAtLocation("station-alpha");

    const state = manager.startNPCInteraction(npcs[0]!, "station-alpha");

    expect(state.availableOptions).toContain("continue");
    expect(state.availableOptions).toContain("close");
  });

  it("returns null from getDialogueState() before any interaction is started", () => {
    const manager = new LocationManager();
    expect(manager.getDialogueState()).toBeNull();
  });

  it("getDialogueState() returns a snapshot matching the active dialogue", () => {
    // Given: an interaction is in progress
    const manager = new LocationManager();
    const npcs = manager.getNPCsAtLocation("station-alpha");
    const started = manager.startNPCInteraction(npcs[0]!, "station-alpha");

    // When: we read the dialogue state
    const state = manager.getDialogueState();

    // Then: it matches the started snapshot
    expect(state).not.toBeNull();
    expect(state!.phase).toBe(started.phase);
    expect(state!.message).toBe(started.message);
    expect(state!.npc.id).toBe(started.npc.id);
  });

  it("the returned snapshot is a copy, not a shared reference", () => {
    // Given: two successive calls
    const manager = new LocationManager();
    const npcs = manager.getNPCsAtLocation("station-alpha");
    const state1 = manager.startNPCInteraction(npcs[0]!, "station-alpha");
    const state2 = manager.getDialogueState();

    // Then: mutating the options array on one doesn't affect the other
    state1.availableOptions.push("close");
    expect(state2!.availableOptions).not.toHaveLength(state1.availableOptions.length);
  });
});

// ── selectDialogueOption("continue") ─────────────────────────────────────────

describe("LocationManager.selectDialogueOption('continue')", () => {
  it("advances greeting to farewell phase with the NPC's idle message", () => {
    // Given: an active greeting dialogue
    const manager = new LocationManager();
    const npcs = manager.getNPCsAtLocation("station-alpha");
    const voss = npcs.find((n) => n.id === "npc-commander-voss")!;
    manager.startNPCInteraction(voss, "station-alpha");

    // When: player chooses "continue"
    const { transitionTo, dialogueState } =
      manager.selectDialogueOption("continue");

    // Then: farewell phase with idle message
    expect(transitionTo).toBe("farewell");
    expect(dialogueState).not.toBeNull();
    expect(dialogueState!.phase).toBe("farewell");
    expect(dialogueState!.message).toBe(voss.dialogueIdle);
  });

  it("farewell phase only offers the 'close' option", () => {
    const manager = new LocationManager();
    const npcs = manager.getNPCsAtLocation("station-alpha");
    manager.startNPCInteraction(npcs[0]!, "station-alpha");
    const { dialogueState } = manager.selectDialogueOption("continue");

    expect(dialogueState!.availableOptions).toEqual(["close"]);
  });
});

// ── selectDialogueOption("shop") ──────────────────────────────────────────────

describe("LocationManager.selectDialogueOption('shop')", () => {
  it("returns transitionTo: 'shop' and preserves the dialogue state", () => {
    // Given: an active greeting dialogue at a location with shops
    const manager = new LocationManager();
    const npcs = manager.getNPCsAtLocation("station-alpha");
    manager.startNPCInteraction(npcs[0]!, "station-alpha");

    // When: player chooses "shop"
    const { transitionTo, dialogueState } = manager.selectDialogueOption("shop");

    // Then: shop transition signalled, dialogue still shows greeting
    expect(transitionTo).toBe("shop");
    expect(dialogueState).not.toBeNull();
    expect(dialogueState!.phase).toBe("greeting");
  });

  it("getDialogueState() still returns the greeting after a shop transition", () => {
    const manager = new LocationManager();
    const npcs = manager.getNPCsAtLocation("station-alpha");
    manager.startNPCInteraction(npcs[0]!, "station-alpha");
    manager.selectDialogueOption("shop");

    // Dialogue is not closed, so state should still be accessible
    expect(manager.getDialogueState()).not.toBeNull();
    expect(manager.getDialogueState()!.phase).toBe("greeting");
  });
});

// ── selectDialogueOption("close") ─────────────────────────────────────────────

describe("LocationManager.selectDialogueOption('close')", () => {
  it("closes the dialogue from greeting phase", () => {
    const manager = new LocationManager();
    const npcs = manager.getNPCsAtLocation("station-alpha");
    manager.startNPCInteraction(npcs[0]!, "station-alpha");

    const { transitionTo, dialogueState } = manager.selectDialogueOption("close");

    expect(transitionTo).toBe("closed");
    expect(dialogueState).toBeNull();
    expect(manager.getDialogueState()).toBeNull();
  });

  it("closes the dialogue from farewell phase", () => {
    const manager = new LocationManager();
    const npcs = manager.getNPCsAtLocation("station-alpha");
    manager.startNPCInteraction(npcs[0]!, "station-alpha");
    manager.selectDialogueOption("continue"); // advance to farewell

    const { transitionTo, dialogueState } = manager.selectDialogueOption("close");

    expect(transitionTo).toBe("closed");
    expect(dialogueState).toBeNull();
  });
});

// ── selectDialogueOption — no active session ──────────────────────────────────

describe("LocationManager.selectDialogueOption — no active session", () => {
  it("returns transitionTo: 'closed' when no dialogue is active", () => {
    const manager = new LocationManager();

    // No startNPCInteraction was called
    const { transitionTo, dialogueState } = manager.selectDialogueOption("continue");

    expect(transitionTo).toBe("closed");
    expect(dialogueState).toBeNull();
  });
});

// ── closeDialogue ─────────────────────────────────────────────────────────────

describe("LocationManager.closeDialogue", () => {
  it("resets the active dialogue so getDialogueState returns null", () => {
    const manager = new LocationManager();
    const npcs = manager.getNPCsAtLocation("station-alpha");
    manager.startNPCInteraction(npcs[0]!, "station-alpha");

    manager.closeDialogue();

    expect(manager.getDialogueState()).toBeNull();
  });

  it("is a no-op when no dialogue is active", () => {
    const manager = new LocationManager();
    // Should not throw
    expect(() => manager.closeDialogue()).not.toThrow();
  });
});

// ── getShopInventory ──────────────────────────────────────────────────────────

describe("LocationManager.getShopInventory", () => {
  it("returns a non-empty item list for Station Alpha", () => {
    // Given: Station Alpha has shop-tf-alpha with several items
    const manager = new LocationManager();
    const items = manager.getShopInventory("station-alpha");

    expect(items.length).toBeGreaterThan(0);
  });

  it("every item has all required fields with valid values", () => {
    const manager = new LocationManager();
    const items = manager.getShopInventory("station-alpha");

    for (const item of items) {
      expect(typeof item.id).toBe("string");
      expect(item.id.length).toBeGreaterThan(0);
      expect(typeof item.name).toBe("string");
      expect(typeof item.priceCredits).toBe("number");
      expect(item.priceCredits).toBeGreaterThan(0);
      expect(typeof item.description).toBe("string");
      expect(["weapon", "ability", "equipment", "consumable"]).toContain(item.category);
    }
  });

  it("returns an empty array for an unknown location id", () => {
    const manager = new LocationManager();
    expect(manager.getShopInventory("no-such-location")).toEqual([]);
  });

  it("returns items from multiple shops when a location has more than one", () => {
    // Given: Neutral Hub has shop-vm-neutral (large depot)
    const manager = new LocationManager();
    const items = manager.getShopInventory("neutral-hub");
    expect(items.length).toBeGreaterThan(3);
  });
});

// ── purchaseItem — happy path ─────────────────────────────────────────────────

describe("LocationManager.purchaseItem — happy path", () => {
  it("deducts the item price from the player's credits", () => {
    // Given: player has 1000 credits, item costs 100
    const manager = new LocationManager();
    const result = manager.purchaseItem("item-medkit", 1000);

    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(900);
    expect(result.reason).toBeUndefined();
  });

  it("succeeds when the player has exactly enough credits", () => {
    // Given: player has exactly the item price
    const manager = new LocationManager();
    const result = manager.purchaseItem("item-medkit", 100); // item costs 100

    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(0);
  });

  it("includes the item definition in the result", () => {
    const manager = new LocationManager();
    const result = manager.purchaseItem("item-laser-cannon", 2000);

    expect(result.success).toBe(true);
    expect(result.item).toBeDefined();
    expect(result.item!.id).toBe("item-laser-cannon");
    expect(result.item!.priceCredits).toBe(900);
  });
});

// ── purchaseItem — unhappy paths ──────────────────────────────────────────────

describe("LocationManager.purchaseItem — unhappy paths", () => {
  it("fails with 'insufficient-credits' when the player cannot afford the item", () => {
    // Given: player has only 50 credits, item costs 100
    const manager = new LocationManager();
    const result = manager.purchaseItem("item-medkit", 50);

    expect(result.success).toBe(false);
    expect(result.reason).toBe("insufficient-credits");
    expect(result.newBalance).toBeUndefined();
  });

  it("still includes the item in the result when credits are insufficient", () => {
    // So the UI can display the item details alongside the denial message
    const manager = new LocationManager();
    const result = manager.purchaseItem("item-medkit", 50);

    expect(result.item).toBeDefined();
    expect(result.item!.id).toBe("item-medkit");
  });

  it("fails with 'item-not-found' for an unknown item id", () => {
    const manager = new LocationManager();
    const result = manager.purchaseItem("item-does-not-exist", 10000);

    expect(result.success).toBe(false);
    expect(result.reason).toBe("item-not-found");
    expect(result.newBalance).toBeUndefined();
  });
});

// ── sellItem — happy path ─────────────────────────────────────────────────────

describe("LocationManager.sellItem — happy path", () => {
  it("earns floor(priceCredits × 0.5) and adds it to the player's balance", () => {
    // Given: item-medkit costs 100 → sell price = 50
    const manager = new LocationManager();
    const result = manager.sellItem("item-medkit", 200);

    expect(result.success).toBe(true);
    expect(result.creditsEarned).toBe(50);
    expect(result.newBalance).toBe(250);
  });

  it("floors fractional sell prices correctly (salvage-kit: 75 → 37)", () => {
    // item-salvage-kit costs 75 → floor(75 * 0.5) = floor(37.5) = 37
    const manager = new LocationManager();
    const result = manager.sellItem("item-salvage-kit", 100);

    expect(result.success).toBe(true);
    expect(result.creditsEarned).toBe(37);
    expect(result.newBalance).toBe(137);
  });

  it("credits accumulate across multiple sells", () => {
    // Given: player sells two items
    const manager = new LocationManager();
    const r1 = manager.sellItem("item-medkit", 0); // earn 50
    const r2 = manager.sellItem("item-medkit", r1.newBalance!); // earn another 50

    expect(r1.newBalance).toBe(50);
    expect(r2.newBalance).toBe(100);
  });
});

// ── sellItem — unhappy path ───────────────────────────────────────────────────

describe("LocationManager.sellItem — unhappy path", () => {
  it("fails with 'item-not-found' for an unknown item id", () => {
    const manager = new LocationManager();
    const result = manager.sellItem("item-ghost", 500);

    expect(result.success).toBe(false);
    expect(result.creditsEarned).toBe(0);
    expect(result.reason).toBe("item-not-found");
    expect(result.newBalance).toBeUndefined();
  });
});
