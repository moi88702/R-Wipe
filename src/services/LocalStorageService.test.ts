import { describe, expect, it } from "vitest";
import {
  InMemoryStorage,
  StorageMigrationError,
  VersionedSlot,
} from "./LocalStorageService";

interface DemoV1 {
  n: number;
}
interface DemoV2 {
  n: number;
  label: string;
}

describe("VersionedSlot", () => {
  it("returns null when storage is empty", () => {
    const storage = new InMemoryStorage();
    const slot = new VersionedSlot<DemoV1>({
      key: "k",
      currentVersion: 1,
      storage,
    });
    expect(slot.load()).toBeNull();
  });

  it("round-trips a payload through save → load", () => {
    const storage = new InMemoryStorage();
    const slot = new VersionedSlot<DemoV1>({
      key: "k",
      currentVersion: 1,
      storage,
    });
    slot.save({ n: 42 });
    expect(slot.load()).toEqual({ n: 42 });
  });

  it("runs migrations from older to current version", () => {
    const storage = new InMemoryStorage();
    // Pre-seed storage with a v1 envelope.
    storage.setItem("k", JSON.stringify({ schemaVersion: 1, data: { n: 7 } }));
    const slot = new VersionedSlot<DemoV2>({
      key: "k",
      currentVersion: 2,
      migrations: {
        1: (raw) => ({ ...(raw as DemoV1), label: "migrated" }),
      },
      storage,
    });
    expect(slot.load()).toEqual({ n: 7, label: "migrated" });
  });

  it("throws when a migration is missing", () => {
    const storage = new InMemoryStorage();
    storage.setItem("k", JSON.stringify({ schemaVersion: 1, data: { n: 1 } }));
    const slot = new VersionedSlot<DemoV2>({
      key: "k",
      currentVersion: 3,
      migrations: { 1: (raw) => raw },
      storage,
    });
    expect(() => slot.load()).toThrow(StorageMigrationError);
  });

  it("throws when stored version is newer than app version", () => {
    const storage = new InMemoryStorage();
    storage.setItem("k", JSON.stringify({ schemaVersion: 5, data: { n: 1 } }));
    const slot = new VersionedSlot<DemoV1>({
      key: "k",
      currentVersion: 2,
      storage,
    });
    expect(() => slot.load()).toThrow(StorageMigrationError);
  });

  it("throws when validator rejects the final payload", () => {
    const storage = new InMemoryStorage();
    storage.setItem("k", JSON.stringify({ schemaVersion: 1, data: { n: "not-a-number" } }));
    const slot = new VersionedSlot<DemoV1>({
      key: "k",
      currentVersion: 1,
      storage,
      validate: (raw): raw is DemoV1 =>
        typeof raw === "object" && raw !== null &&
        typeof (raw as { n: unknown }).n === "number",
    });
    expect(() => slot.load()).toThrow(StorageMigrationError);
  });

  it("throws on corrupt JSON", () => {
    const storage = new InMemoryStorage();
    storage.setItem("k", "{not-json");
    const slot = new VersionedSlot<DemoV1>({
      key: "k",
      currentVersion: 1,
      storage,
    });
    expect(() => slot.load()).toThrow(StorageMigrationError);
  });

  it("treats an un-envelope'd payload as v1", () => {
    const storage = new InMemoryStorage();
    storage.setItem("k", JSON.stringify({ n: 99 }));
    const slot = new VersionedSlot<DemoV1>({
      key: "k",
      currentVersion: 1,
      storage,
    });
    expect(slot.load()).toEqual({ n: 99 });
  });

  it("clear() removes the entry", () => {
    const storage = new InMemoryStorage();
    const slot = new VersionedSlot<DemoV1>({
      key: "k",
      currentVersion: 1,
      storage,
    });
    slot.save({ n: 1 });
    slot.clear();
    expect(slot.load()).toBeNull();
  });

  it("no-ops when storage is null", () => {
    const slot = new VersionedSlot<DemoV1>({
      key: "k",
      currentVersion: 1,
      storage: null,
    });
    slot.save({ n: 1 });
    expect(slot.load()).toBeNull();
  });
});
