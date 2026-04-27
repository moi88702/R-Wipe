/**
 * LocalStorageService — tiny, versioned JSON save/load with an explicit
 * migration hook. Used by the campaign (OverworldManager) and the ship
 * builder (BlueprintStore, phase D).
 *
 * Pattern mirrors services/StatsService.ts: safe in Node tests — when
 * localStorage is absent, reads return null and writes no-op.
 *
 * Each storage slot has its own schema version. A load that encounters an
 * older version runs through the registered migration chain, which must
 * produce a current-version payload (or throw with a clear message so the
 * caller can decide between reset-to-default and hard error).
 */

export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Returns the real `window.localStorage`, or null in non-browser contexts. */
export function defaultStorage(): StorageBackend | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * A migration upgrades a payload of one schema version to the next.
 * `Chain[N]` upgrades version N -> N+1. Chain length = number of migrations.
 */
export type Migration = (raw: unknown) => unknown;

export interface VersionedSlotOpts<T> {
  /** localStorage key. Include the domain so different slots never collide. */
  key: string;
  /** Current schema version. */
  currentVersion: number;
  /**
   * Migrations keyed by *from* version (so `migrations[1]` upgrades v1 → v2).
   * If a stored payload is older than currentVersion, every step from its
   * version up to currentVersion must be registered or load() throws.
   */
  migrations?: Record<number, Migration>;
  /** Optional runtime validation of the final payload before returning. */
  validate?: (raw: unknown) => raw is T;
  /** Storage backend. Defaults to window.localStorage (or null in Node). */
  storage?: StorageBackend | null;
}

export interface StoredEnvelope {
  schemaVersion: number;
  data: unknown;
}

/**
 * Type guard for the envelope shape `{ schemaVersion: number, data: unknown }`.
 * Payloads that don't match this shape are treated as v1 legacy data for the
 * common case of promoting existing un-envelope'd state.
 */
function isEnvelope(raw: unknown): raw is StoredEnvelope {
  return (
    typeof raw === "object" &&
    raw !== null &&
    "schemaVersion" in raw &&
    typeof (raw as { schemaVersion: unknown }).schemaVersion === "number" &&
    "data" in raw
  );
}

export class VersionedSlot<T> {
  private readonly opts: Required<Omit<VersionedSlotOpts<T>, "validate" | "storage">> & {
    validate: VersionedSlotOpts<T>["validate"];
    storage: StorageBackend | null;
  };

  constructor(opts: VersionedSlotOpts<T>) {
    this.opts = {
      key: opts.key,
      currentVersion: opts.currentVersion,
      migrations: opts.migrations ?? {},
      validate: opts.validate,
      storage: opts.storage ?? defaultStorage(),
    };
  }

  /**
   * Attempts to load the stored payload. Returns:
   *  - `null` if no value is stored or storage is unavailable.
   *  - The migrated + validated payload on success.
   *
   * Throws `StorageMigrationError` if the stored version is newer than the
   * current app version, if a required migration is missing, or if validation
   * fails. Callers typically catch and reset-to-default.
   */
  load(): T | null {
    const s = this.opts.storage;
    if (!s) return null;
    const raw = s.getItem(this.opts.key);
    if (raw === null) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new StorageMigrationError(`Corrupt JSON at ${this.opts.key}`);
    }

    let version: number;
    let data: unknown;
    if (isEnvelope(parsed)) {
      version = parsed.schemaVersion;
      data = parsed.data;
    } else {
      // Legacy payloads predating the envelope → treat as v1.
      version = 1;
      data = parsed;
    }

    if (version > this.opts.currentVersion) {
      throw new StorageMigrationError(
        `Stored version ${version} at ${this.opts.key} is newer than app version ${this.opts.currentVersion}`,
      );
    }

    while (version < this.opts.currentVersion) {
      const step = this.opts.migrations[version];
      if (!step) {
        throw new StorageMigrationError(
          `Missing migration from v${version} to v${version + 1} at ${this.opts.key}`,
        );
      }
      data = step(data);
      version += 1;
    }

    if (this.opts.validate && !this.opts.validate(data)) {
      throw new StorageMigrationError(`Validation failed at ${this.opts.key}`);
    }

    return data as T;
  }

  /** Write the current-version payload, wrapping it in the envelope. */
  save(data: T): void {
    const s = this.opts.storage;
    if (!s) return;
    const envelope: StoredEnvelope = {
      schemaVersion: this.opts.currentVersion,
      data,
    };
    try {
      s.setItem(this.opts.key, JSON.stringify(envelope));
    } catch {
      // quota / disabled storage — silently drop, matching StatsService.
    }
  }

  /** Remove the entry if present. */
  clear(): void {
    const s = this.opts.storage;
    if (!s) return;
    s.removeItem(this.opts.key);
  }
}

export class StorageMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageMigrationError";
  }
}

/**
 * In-memory StorageBackend for tests. Use instead of the real browser
 * localStorage so tests are isolated and fast.
 */
export class InMemoryStorage implements StorageBackend {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  size(): number {
    return this.map.size;
  }
}

// ── Named Slot Constants ───────────────────────────────────────────────────

/** localStorage key for the solar system state slot. */
export const SOLAR_SYSTEM_STORAGE_KEY = "rwipe.solarsystem.v1" as const;
/** Current schema version for rwipe.solarsystem.v1. */
export const SOLAR_SYSTEM_SCHEMA_VERSION = 1 as const;
/**
 * Migration chain for rwipe.solarsystem.v1.
 * Add an entry keyed by the *from* version to upgrade to the next version.
 * Example (v1 → v2):
 *   solarSystemMigrations[1] = (raw) => ({ ...(raw as V1), newField: "default" });
 */
export const solarSystemMigrations: Record<number, Migration> = {};

/** localStorage key for the faction standings slot. */
export const FACTIONS_STORAGE_KEY = "rwipe.factions.v1" as const;
/** Current schema version for rwipe.factions.v1. */
export const FACTIONS_SCHEMA_VERSION = 1 as const;
/**
 * Migration chain for rwipe.factions.v1.
 * Example (v1 → v2):
 *   factionsMigrations[1] = (raw) => ({ ...(raw as V1), newField: "default" });
 */
export const factionsMigrations: Record<number, Migration> = {};

/** localStorage key for the mission log slot. */
export const MISSIONS_STORAGE_KEY = "rwipe.missions.v1" as const;
/** Current schema version for rwipe.missions.v1. */
export const MISSIONS_SCHEMA_VERSION = 1 as const;
/**
 * Migration chain for rwipe.missions.v1.
 * Example (v1 → v2):
 *   missionsMigrations[1] = (raw) => ({ ...(raw as V1), newField: "default" });
 */
export const missionsMigrations: Record<number, Migration> = {};

/** localStorage key for the capital ship blueprint and upgrades slot. */
export const CAPITAL_SHIP_STORAGE_KEY = "rwipe.capital-ship.v1" as const;
/** Current schema version for rwipe.capital-ship.v1. */
export const CAPITAL_SHIP_SCHEMA_VERSION = 1 as const;
/**
 * Migration chain for rwipe.capital-ship.v1.
 * Example (v1 → v2):
 *   capitalShipMigrations[1] = (raw) => ({ ...(raw as V1), newField: "default" });
 */
export const capitalShipMigrations: Record<number, Migration> = {};

// ── LocalStorageService ────────────────────────────────────────────────────

/**
 * Central service that provides generic versioned load / save operations over
 * localStorage. Each call delegates to a fresh `VersionedSlot` instance, so
 * the caller supplies the key, current schema version, and any migration steps
 * needed to bring older stored payloads up to date.
 *
 * The four named slot constants (`SOLAR_SYSTEM_STORAGE_KEY`, etc.) and their
 * companion migration registries (`solarSystemMigrations`, etc.) are exported
 * from this module so all code that touches a given slot can share the same
 * config object. To add a v1→v2 migration, set:
 *
 *   solarSystemMigrations[1] = (raw) => ({ ...(raw as OldShape), newField: "" });
 *   // bump SOLAR_SYSTEM_SCHEMA_VERSION to 2 in the same commit.
 *
 * Usage:
 *   const svc = new LocalStorageService(new InMemoryStorage());
 *   svc.save(SOLAR_SYSTEM_STORAGE_KEY, myState, SOLAR_SYSTEM_SCHEMA_VERSION);
 *   const state = svc.load<SolarSystemState>(
 *     SOLAR_SYSTEM_STORAGE_KEY,
 *     SOLAR_SYSTEM_SCHEMA_VERSION,
 *     solarSystemMigrations,
 *   );
 */
export class LocalStorageService {
  constructor(private readonly storage: StorageBackend | null = defaultStorage()) {}

  /**
   * Load a versioned payload from storage.
   *
   * Returns `null` when nothing is stored under `key` or when storage is
   * unavailable (e.g. running in Node without an InMemoryStorage override).
   *
   * Throws `StorageMigrationError` on:
   *  - corrupt JSON
   *  - a stored version newer than `version` (forward-compat guard)
   *  - a missing migration step in the chain
   *  - optional validator rejection
   */
  load<T>(
    key: string,
    version: number,
    migrations: Record<number, Migration> = {},
  ): T | null {
    return new VersionedSlot<T>({
      key,
      currentVersion: version,
      migrations,
      storage: this.storage,
    }).load();
  }

  /**
   * Persist a versioned payload to storage.
   * No-ops silently when storage is unavailable.
   */
  save<T>(key: string, value: T, version: number): void {
    new VersionedSlot<T>({
      key,
      currentVersion: version,
      storage: this.storage,
    }).save(value);
  }

  /** Remove the stored entry for the given key. No-op if absent. */
  clear(key: string): void {
    if (this.storage) this.storage.removeItem(key);
  }
}
