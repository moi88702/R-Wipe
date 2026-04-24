import { describe, it, expect } from "vitest";
import { LoadoutManager } from "./LoadoutManager";

describe("LoadoutManager.install", () => {
  it("installs an ability with the given capacity and starting ammo", () => {
    const lm = new LoadoutManager();
    const inst = lm.install("panic-bomb", 3, 2);
    expect(inst.def.id).toBe("panic-bomb");
    expect(inst.ammo).toBe(2);
    expect(inst.ammoMax).toBe(3);
  });

  it("defaults starting ammo to capacity when omitted", () => {
    const lm = new LoadoutManager();
    const inst = lm.install("panic-bomb", 5);
    expect(inst.ammo).toBe(5);
  });

  it("updates capacity + clamps ammo on re-install", () => {
    const lm = new LoadoutManager();
    lm.install("panic-bomb", 3, 3);
    const inst = lm.install("panic-bomb", 1, 3);
    expect(inst.ammoMax).toBe(1);
    expect(inst.ammo).toBe(1);
  });
});

describe("LoadoutManager.tryActivate", () => {
  it("succeeds when off cooldown and ammo is sufficient", () => {
    const lm = new LoadoutManager();
    lm.install("panic-bomb", 3, 3);
    const res = lm.tryActivate("panic-bomb");
    expect(res.ok).toBe(true);
    expect(lm.get("panic-bomb")!.ammo).toBe(2);
    expect(lm.get("panic-bomb")!.currentCooldownMs).toBeGreaterThan(0);
  });

  it("rejects if the ability isn't installed", () => {
    const lm = new LoadoutManager();
    const res = lm.tryActivate("panic-bomb");
    expect(res).toEqual({ ok: false, reason: "unknown-ability" });
  });

  it("rejects with on-cooldown and does not spend ammo", () => {
    const lm = new LoadoutManager();
    lm.install("panic-bomb", 3, 3);
    lm.tryActivate("panic-bomb");
    const res = lm.tryActivate("panic-bomb");
    expect(res).toEqual({ ok: false, reason: "on-cooldown" });
    expect(lm.get("panic-bomb")!.ammo).toBe(2); // only first fire spent ammo
  });

  it("rejects with no-ammo when ammo is exhausted", () => {
    const lm = new LoadoutManager();
    lm.install("panic-bomb", 1, 1);
    expect(lm.tryActivate("panic-bomb").ok).toBe(true);
    // fast-forward past cooldown
    lm.tick(10_000);
    const res = lm.tryActivate("panic-bomb");
    expect(res).toEqual({ ok: false, reason: "no-ammo" });
  });

  it("never consumes ammo for abilities with ammoType 'none'", () => {
    const lm = new LoadoutManager();
    lm.install("shield", 1);
    const before = lm.get("shield")!.ammo;
    const res = lm.tryActivate("shield");
    expect(res.ok).toBe(true);
    expect(lm.get("shield")!.ammo).toBe(before);
  });

  it("rejects passive abilities with reason 'passive'", () => {
    const lm = new LoadoutManager();
    lm.install("weapon-upgrade", 1);
    const res = lm.tryActivate("weapon-upgrade");
    expect(res).toEqual({ ok: false, reason: "passive" });
  });

  it("treats Infinity ammo as unlimited", () => {
    const lm = new LoadoutManager();
    lm.install("panic-bomb", Infinity, Infinity);
    lm.tryActivate("panic-bomb");
    expect(lm.get("panic-bomb")!.ammo).toBe(Infinity);
  });
});

describe("LoadoutManager.tick", () => {
  it("counts down active cooldowns and clamps at zero", () => {
    const lm = new LoadoutManager();
    lm.install("panic-bomb", 3);
    lm.tryActivate("panic-bomb");
    const cd = lm.get("panic-bomb")!.currentCooldownMs;
    lm.tick(cd / 2);
    expect(lm.get("panic-bomb")!.currentCooldownMs).toBeGreaterThan(0);
    lm.tick(cd);
    expect(lm.get("panic-bomb")!.currentCooldownMs).toBe(0);
  });
});

describe("LoadoutManager.refillAmmo", () => {
  it("refills only abilities that use the given ammo type, clamped at max", () => {
    const lm = new LoadoutManager();
    lm.install("panic-bomb", 3, 0);
    lm.install("nanorepair", 2, 0);
    lm.refillAmmo("panic-bombs", 2);
    expect(lm.get("panic-bomb")!.ammo).toBe(2);
    expect(lm.get("nanorepair")!.ammo).toBe(0);
    lm.refillAmmo("panic-bombs", 99);
    expect(lm.get("panic-bomb")!.ammo).toBe(3);
  });

  it("never affects Infinity ammo", () => {
    const lm = new LoadoutManager();
    lm.install("panic-bomb", Infinity, Infinity);
    lm.refillAmmo("panic-bombs", 5);
    expect(lm.get("panic-bomb")!.ammo).toBe(Infinity);
  });
});

describe("LoadoutManager.totalPowerDraw", () => {
  it("sums power draw across installed abilities", () => {
    const lm = new LoadoutManager();
    lm.install("primary-weapon", 1); // 10
    lm.install("shield", 1);         // 20
    lm.install("panic-bomb", 3);     // 25
    expect(lm.totalPowerDraw()).toBe(55);
  });
});
