/**
 * GameConfig — central registry of tunable game constants.
 *
 * Split into two logical sections:
 *  - Arcade constants: values that govern the classic scrolling-shooter mode.
 *  - Solar system constants: values introduced for the open-world exploration
 *    feature (task f9a8a479-e84b-45d9-b6ba-1dc7e1251528).
 *
 * All values are intentionally `const` (compile-time literals) so that dead
 * branches can be tree-shaken in production builds. Do NOT use computed
 * expressions that defeat static analysis; prefer plain numeric literals or
 * simple arithmetic that TypeScript can fold at compile time.
 *
 * Naming convention: SCREAMING_SNAKE_CASE for all exported constants.
 */

// ---------------------------------------------------------------------------
// Arcade / core gameplay constants
// ---------------------------------------------------------------------------

/** Logical width of the game canvas in pixels (internal coordinate space). */
export const CANVAS_WIDTH = 1280;

/** Logical height of the game canvas in pixels (internal coordinate space). */
export const CANVAS_HEIGHT = 720;

/** How many pixels per second the player ship moves when a direction is held. */
export const PLAYER_SPEED_PX_S = 400;

// ---------------------------------------------------------------------------
// Solar system constants
// ---------------------------------------------------------------------------

/**
 * Maximum distance (km) between the player's capital ship and a location at
 * which the docking approach overlay is presented.
 *
 * The product spec says "~1–2 km". We default to 2 km so it feels generous
 * during early iteration; tune down if it proves too easy to accidentally
 * trigger.
 */
export const DOCKING_RANGE_KM = 2;

/**
 * Minimum zoom factor for the solar system map view.
 *
 * At ZOOM_MIN the camera is pulled back as far as allowed, giving the widest
 * tactical overview. Values < 1 shrink everything on screen.
 */
export const ZOOM_MIN = 0.5;

/**
 * Maximum zoom factor for the solar system map view.
 *
 * At ZOOM_MAX the camera is pushed in as close as allowed, showing fine
 * positioning detail near the ship or a target. Values > 1 enlarge everything.
 */
export const ZOOM_MAX = 3.0;

/**
 * Default surface gravitational acceleration of the primary celestial body
 * (m/s²). Applied via the inverse-square law:
 *   a = PRIMARY_BODY_GRAVITY_STRENGTH × (radius / distance)²
 *
 * An Earth-like value of 9.8 m/s² provides a familiar feel while allowing
 * simple test calculations. Individual celestial bodies store their own
 * `gravityStrength` field; this constant is the fallback / generation default.
 */
export const PRIMARY_BODY_GRAVITY_STRENGTH = 9.8;

/**
 * Speed (m/s) above which the player's capital ship is considered to have
 * achieved escape velocity and will exit the current celestial body's gravity
 * well. Used by GravitySystem to determine when to stop applying the primary
 * body's influence.
 *
 * 500 m/s is substantially higher than orbital velocity at docking range but
 * reachable with sustained thrust, so players must actively work to escape.
 */
export const ESCAPE_VELOCITY_THRESHOLD_MS = 500;

/**
 * Interval (ms) between gravity calculation updates. Setting this to 0 means
 * gravity is recalculated every frame (the default recommended in the design
 * doc). A non-zero value throttles updates for performance at the cost of
 * precision; start at 0 and only tune if profiling shows a bottleneck.
 */
export const GRAVITY_UPDATE_INTERVAL_MS = 0;

/**
 * Extra clearance (km) added to a celestial body's radius when testing for
 * ship–body collisions. Prevents the ship's sprite from visually clipping
 * into a planet surface before the collision response fires.
 *
 * Keep this value small (e.g., 0.5 km) so the collision response feels tight
 * rather than triggering noticeably before visual contact.
 */
export const CELESTIAL_BODY_COLLISION_MARGIN_KM = 0.5;

/**
 * Time (ms) after a resource deposit is fully harvested before it respawns at
 * the same or a nearby location. A 5-minute window (300 000 ms) prevents
 * trivial farming while still rewarding return trips.
 */
export const RESOURCE_DEPOSIT_RESPAWN_MS = 300_000;
