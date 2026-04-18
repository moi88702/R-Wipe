import { describe, expect, it } from "vitest";
import { BlueprintStore, BLUEPRINT_STORAGE_KEY } from "./BlueprintStore";
import { InMemoryStorage, StorageMigrationError } from "../services/LocalStorageService";
import type { Blueprint } from "../types/shipBuilder";

const sample: Blueprint = {
  id: "bp-1",
  name: "Interceptor",
  parts: [
    { id: "r", partId: "hull-standard-t1", parentId: null, parentSocketId: null, colourId: null },
    { id: "c", partId: "cockpit-standard-t1", parentId: "r", parentSocketId: "s-nose", colourId: null },
  ],
};

describe("BlueprintStore", () => {
  it("starts empty", () => {
    const s = new BlueprintStore(null);
    expect(s.list()).toEqual([]);
  });

  it("upsert inserts and replaces by id", () => {
    const s = new BlueprintStore(null);
    s.upsert(sample);
    expect(s.list().length).toBe(1);
    s.upsert({ ...sample, name: "Renamed" });
    expect(s.list().length).toBe(1);
    expect(s.get("bp-1")?.name).toBe("Renamed");
  });

  it("delete removes by id", () => {
    const s = new BlueprintStore(null);
    s.upsert(sample);
    expect(s.delete("bp-1")).toBe(true);
    expect(s.list()).toEqual([]);
    expect(s.delete("bp-1")).toBe(false);
  });

  it("round-trips through storage", () => {
    const storage = new InMemoryStorage();
    const a = new BlueprintStore(storage);
    a.upsert(sample);
    a.save();

    const b = new BlueprintStore(storage);
    expect(b.load()).toBe(true);
    expect(b.list().length).toBe(1);
    expect(b.get("bp-1")?.name).toBe("Interceptor");
  });

  it("throws StorageMigrationError on malformed payload", () => {
    const storage = new InMemoryStorage();
    storage.setItem(
      BLUEPRINT_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, data: { blueprints: [{ garbage: true }] } }),
    );
    const s = new BlueprintStore(storage);
    expect(() => s.load()).toThrow(StorageMigrationError);
  });

  it("returns false from load when storage is empty", () => {
    const s = new BlueprintStore(new InMemoryStorage());
    expect(s.load()).toBe(false);
  });
});
