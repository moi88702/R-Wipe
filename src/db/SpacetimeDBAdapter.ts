import type { Row, StorageAdapter, Unsubscribe } from "./types";

/**
 * SpacetimeDBAdapter — future implementation of StorageAdapter backed by
 * SpacetimeDB (https://spacetimedb.com).
 *
 * ── Integration notes ───────────────────────────────────────────────────────
 *
 * SpacetimeDB uses a different mental model than local storage:
 *
 *   READS  — After `subscribe()` is called, SpacetimeDB streams the full table
 *             snapshot + incremental diffs over a WebSocket.  The client-side
 *             SDK maintains a local cache that is always up-to-date.  `get()`
 *             and `getAll()` should read directly from that cache (synchronous
 *             under the hood, wrapped in Promise.resolve() here).
 *
 *   WRITES — Every write must go through a server-side *reducer* (Rust/C#
 *             function on the SpacetimeDB module).  The expected reducers for
 *             this game are:
 *               • upsert_pilot_profile(profile: PilotProfile)
 *               • upsert_faction_standing(standing: FactionStanding)
 *               • upsert_pilot_skills(skills: PilotSkills)
 *               • delete_row(table: String, id: String)
 *
 *   SUBSCRIPTIONS — Call `conn.subscribe(["SELECT * FROM <table>"])` once per
 *             table during connect().  Then wire `client_db.<table>.onInsert`,
 *             `.onUpdate`, and `.onDelete` to the handler bus in this class.
 *
 * ── SDK bootstrap (pseudocode) ──────────────────────────────────────────────
 *
 *   import { SpacetimeDBClient } from "@clockworklabs/spacetimedb-sdk";
 *
 *   const conn = await SpacetimeDBClient.connect(
 *     "wss://maincloud.spacetimedb.com",   // host
 *     "rwipe-game",                         // database namespace
 *     authToken,                            // JWT from your auth flow
 *   );
 *
 *   // Subscribe to every RPG table
 *   conn.subscribe(["SELECT * FROM pilot_profiles",
 *                   "SELECT * FROM faction_standings",
 *                   "SELECT * FROM pilot_skills"]);
 *
 *   // Wire incremental updates to your handler bus
 *   conn.db.pilot_profiles.onInsert((row, _reducerEvent) => { ... });
 *   conn.db.pilot_profiles.onUpdate((_old, row, _ev) => { ... });
 *   conn.db.pilot_profiles.onDelete((row, _ev) => { ... });
 *
 * ── Swapping the adapter ─────────────────────────────────────────────────────
 *
 *   // In production entry-point (main.ts or a config module):
 *   const adapter = new SpacetimeDBAdapter(host, namespace, authToken);
 *   const rpg = new RPGDatabase(adapter);
 *   await rpg.connect();
 *
 *   // Everything above RPGDatabase is unchanged — no game logic needs
 *   // to know which adapter is in use.
 *
 * This file is intentionally left as a stub.  Implement the body once the
 * SpacetimeDB module schema (Rust side) is defined.
 */
export class SpacetimeDBAdapter implements StorageAdapter {
  private _connected = false;

  /** Connection config — consumed by connect() once implemented. */
  private readonly config: { host: string; namespace: string; authToken: string };

  constructor(host: string, namespace: string, authToken: string) {
    this.config = { host, namespace, authToken };
  }

  get isConnected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    // TODO: SpacetimeDBClient.connect(this.config.host, this.config.namespace, this.config.authToken)
    //       then subscribe to all RPG tables and wire onInsert/onUpdate/onDelete
    void this.config; // referenced here so the field is not "never read"
    throw new Error("SpacetimeDBAdapter.connect() — not yet implemented");
  }

  disconnect(): void {
    // TODO: conn.disconnect()
    this._connected = false;
  }

  async get<T extends Row>(_table: string, _id: string): Promise<T | null> {
    // TODO: return this.cache.get(_table)?.get(_id) ?? null
    throw new Error("SpacetimeDBAdapter.get() — not yet implemented");
  }

  async getAll<T extends Row>(_table: string): Promise<T[]> {
    // TODO: return Array.from(this.cache.get(_table)?.values() ?? [])
    throw new Error("SpacetimeDBAdapter.getAll() — not yet implemented");
  }

  async upsert<T extends Row>(_table: string, _item: T): Promise<void> {
    // TODO: conn.callReducer(`upsert_${_table}`, _item)
    throw new Error("SpacetimeDBAdapter.upsert() — not yet implemented");
  }

  async remove(_table: string, _id: string): Promise<void> {
    // TODO: conn.callReducer("delete_row", { table: _table, id: _id })
    throw new Error("SpacetimeDBAdapter.remove() — not yet implemented");
  }

  subscribe<T extends Row>(
    _table: string,
    _handler: (items: T[]) => void,
  ): Unsubscribe {
    // TODO: wire conn.db[_table].onInsert/onUpdate/onDelete to _handler
    throw new Error("SpacetimeDBAdapter.subscribe() — not yet implemented");
  }
}
