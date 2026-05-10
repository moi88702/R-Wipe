import type { Row, StorageAdapter, Unsubscribe } from "./types";

type Handlers = Set<(items: Row[]) => void>;

/** Increment this when you add a new table to ALL_RPG_TABLES. */
const IDB_VERSION = 1;

/**
 * IndexedDBAdapter — browser-native IDB implementation of StorageAdapter.
 *
 * Each table string maps to an IDB object store keyed by the record's `id`
 * field.  The full list of tables must be declared at construction time so the
 * `onupgradeneeded` handler can create every store in one schema migration.
 *
 * When you add a new RPG table:
 *   1. Add the name to ALL_RPG_TABLES in src/rpg/schema.ts.
 *   2. Bump IDB_VERSION above.
 *   3. The existing `onupgradeneeded` loop will create the new store
 *      automatically on the next browser open.
 *
 * Subscriptions are maintained via an in-process event bus — every successful
 * write to a table notifies all handlers registered for that table with the
 * new full-table snapshot.
 *
 * SpacetimeDB migration path
 * ──────────────────────────
 * Replace this adapter with SpacetimeDBAdapter (see SpacetimeDBAdapter.ts).
 * The RPGDatabase facade and all game logic stay identical.
 */
export class IndexedDBAdapter implements StorageAdapter {
  private db: IDBDatabase | null = null;
  private readonly dbName: string;
  private readonly tableNames: readonly string[];
  private readonly subs = new Map<string, Handlers>();
  private _connected = false;

  constructor(dbName: string, tables: readonly string[]) {
    this.dbName = dbName;
    this.tableNames = tables;
  }

  get isConnected(): boolean {
    return this._connected;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB unavailable — are you running in a browser?"));
        return;
      }
      const req = indexedDB.open(this.dbName, IDB_VERSION);

      req.onupgradeneeded = (e) => {
        const idb = (e.target as IDBOpenDBRequest).result;
        for (const name of this.tableNames) {
          if (!idb.objectStoreNames.contains(name)) {
            idb.createObjectStore(name, { keyPath: "id" });
          }
        }
      };

      req.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result;
        this._connected = true;
        resolve();
      };

      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("IDB open blocked by another tab"));
    });
  }

  disconnect(): void {
    this.db?.close();
    this.db = null;
    this._connected = false;
    this.subs.clear();
  }

  get<T extends Row>(table: string, id: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const req = this.store(table, "readonly").get(id);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  getAll<T extends Row>(table: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const req = this.store(table, "readonly").getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  }

  async upsert<T extends Row>(table: string, item: T): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const req = this.store(table, "readwrite").put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    await this.notifyAsync(table);
  }

  async remove(table: string, id: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const req = this.store(table, "readwrite").delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    await this.notifyAsync(table);
  }

  subscribe<T extends Row>(
    table: string,
    handler: (items: T[]) => void,
  ): Unsubscribe {
    if (!this.subs.has(table)) this.subs.set(table, new Set());
    const h = handler as (items: Row[]) => void;
    this.subs.get(table)!.add(h);
    // Fire immediately with the current snapshot.
    void this.getAll<T>(table).then(handler);
    return () => this.subs.get(table)?.delete(h);
  }

  private store(name: string, mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) throw new Error("IndexedDBAdapter: not connected");
    return this.db.transaction(name, mode).objectStore(name);
  }

  private async notifyAsync(table: string): Promise<void> {
    const handlers = this.subs.get(table);
    if (!handlers || handlers.size === 0) return;
    const items = await this.getAll(table);
    for (const h of handlers) h(items);
  }
}
