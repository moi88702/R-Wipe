import { describe, it, expect } from "vitest";
import {
  ABILITY_REGISTRY,
  POWER_UP_TO_ABILITY,
  getAbilityDef,
  type AbilityId,
} from "./registry";
import type { PowerUpType } from "../../types/index";

describe("ABILITY_REGISTRY", () => {
  it("every def has a matching id field", () => {
    for (const [id, def] of Object.entries(ABILITY_REGISTRY)) {
      expect(def.id).toBe(id);
    }
  });

  it("every def has a non-empty name and valid bay category", () => {
    const validCats = new Set(["primary", "utility", "defensive", "engine", "reactor"]);
    for (const def of Object.values(ABILITY_REGISTRY)) {
      expect(def.name.length).toBeGreaterThan(0);
      expect(validCats.has(def.bayCategory)).toBe(true);
    }
  });

  it("active abilities with ammo types declare a non-zero ammo cost", () => {
    for (const def of Object.values(ABILITY_REGISTRY)) {
      if (def.kind === "active" && def.ammoType !== "none") {
        expect(def.ammoCostPerUse).toBeGreaterThan(0);
      }
    }
  });

  it("passive abilities have zero cooldown", () => {
    for (const def of Object.values(ABILITY_REGISTRY)) {
      if (def.kind === "passive") expect(def.cooldownMs).toBe(0);
    }
  });
});

describe("POWER_UP_TO_ABILITY", () => {
  it("covers every PowerUpType", () => {
    const expected: PowerUpType[] = [
      "weapon-upgrade",
      "weapon-spread",
      "weapon-bomb",
      "shield",
      "health-recovery",
      "extra-life",
      "speed-boost",
      "mega-laser",
    ];
    for (const t of expected) {
      const id = POWER_UP_TO_ABILITY[t];
      expect(id).toBeDefined();
      expect(ABILITY_REGISTRY[id]).toBeDefined();
    }
  });
});

describe("getAbilityDef", () => {
  it("returns the registered def for a known id", () => {
    expect(getAbilityDef("shield").id).toBe("shield");
  });

  it("throws for an unknown id", () => {
    expect(() => getAbilityDef("does-not-exist" as AbilityId)).toThrow();
  });
});
