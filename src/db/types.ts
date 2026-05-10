/**
 * StorageAdapter — the single interface both IndexedDB (local) and
 * SpacetimeDB (networked) implement.
 *
 * Design contract
 * ───────────────
 * • Tables are named collections of objects that each carry a string `id`.
 * • `get` / `getAll` return async snapshots of the current state.
 * • `upsert` / `remove` are write operations; they resolve once the data is
 *   durably committed (or sent to the server in the STDB case).
 * • `subscribe` delivers the full table snapshot immediately and then fires
 *   the handler on every subsequent change.  The return value cancels the
 *   subscription.
 *
 * SpacetimeDB mapping
 * ───────────────────
 * • `connect`  → SpacetimeDBClient.connect(host, namespace, token)
 * • `upsert`   → conn.callReducer("<Table>Upsert", item)
 * • `remove`   → conn.callReducer("<Table>Delete", { id })
 * • `subscribe`→ conn.subscribe(["SELECT * FROM <table>"]) +
 *                client_db.<table>.onInsert / onUpdate / onDelete handlers
 * • `get` / `getAll` → read from the client-side STDB cache (always in-sync
 *   after the subscription is live)
 */

export type Unsubscribe = () => void;

/** Every persisted record must have a string primary key. */
export interface Row {
  readonly id: string;
}

export interface StorageAdapter {
  /** Open/connect the underlying store.  Must resolve before any other call. */
  connect(): Promise<void>;
  /** Gracefully close the connection and release all subscriptions. */
  disconnect(): void;
  /** True after connect() resolves and before disconnect() is called. */
  readonly isConnected: boolean;

  /** Return one record by primary key, or null if absent. */
  get<T extends Row>(table: string, id: string): Promise<T | null>;
  /** Return all records in a table (empty array if table is empty). */
  getAll<T extends Row>(table: string): Promise<T[]>;
  /** Insert or replace a record (keyed by item.id). */
  upsert<T extends Row>(table: string, item: T): Promise<void>;
  /** Delete a record by primary key.  No-op if absent. */
  remove(table: string, id: string): Promise<void>;

  /**
   * Subscribe to live changes in a table.
   *
   * The handler fires immediately with the current snapshot, then fires again
   * whenever any record in the table is inserted, updated, or deleted.
   *
   * Returns a cancellation function — call it to stop receiving updates.
   */
  subscribe<T extends Row>(
    table: string,
    handler: (items: T[]) => void,
  ): Unsubscribe;
}
