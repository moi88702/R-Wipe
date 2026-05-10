import type { Row, StorageAdapter, Unsubscribe } from "./types";

type TableMap = Map<string, Row>;
type Handlers = Set<(items: Row[]) => void>;

/**
 * InMemoryAdapter — synchronous in-process implementation of StorageAdapter.
 *
 * Intended for unit tests and as a stand-in during development.  All data
 * lives in plain Maps; subscriptions are notified synchronously after every
 * write.  No browser APIs are used — safe in Node test environments.
 */
export class InMemoryAdapter implements StorageAdapter {
  private readonly tables = new Map<string, TableMap>();
  private readonly subs = new Map<string, Handlers>();
  private _connected = false;

  get isConnected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    this._connected = true;
  }

  disconnect(): void {
    this._connected = false;
    this.subs.clear();
  }

  async get<T extends Row>(table: string, id: string): Promise<T | null> {
    return (this.tbl(table).get(id) as T | undefined) ?? null;
  }

  async getAll<T extends Row>(table: string): Promise<T[]> {
    return Array.from(this.tbl(table).values()) as T[];
  }

  async upsert<T extends Row>(table: string, item: T): Promise<void> {
    this.tbl(table).set(item.id, item);
    this.notify(table);
  }

  async remove(table: string, id: string): Promise<void> {
    this.tbl(table).delete(id);
    this.notify(table);
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

  /** Wipe all data — useful between tests. */
  reset(): void {
    this.tables.clear();
  }

  private tbl(name: string): TableMap {
    let t = this.tables.get(name);
    if (!t) { t = new Map(); this.tables.set(name, t); }
    return t;
  }

  private notify(table: string): void {
    const handlers = this.subs.get(table);
    if (!handlers) return;
    const items = Array.from(this.tbl(table).values());
    for (const h of handlers) h(items);
  }
}
