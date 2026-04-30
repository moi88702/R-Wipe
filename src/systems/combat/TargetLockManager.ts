/**
 * TargetLockManager — scanner-based target locking, lock persistence, and
 * focus management for the Space Combat Control System.
 *
 * Design decisions
 * ─────────────────
 * • Pure static API — no mutable instance state.  Any ship (player or enemy)
 *   that carries a TargetingState object can use the same manager.
 *
 * • TargetingState is the single source of truth.  Every method accepts and
 *   mutates a TargetingState in-place so callers retain full ownership of the
 *   object and can serialise / restore it via the existing save-load system.
 *
 * • Penetration model — celestial body types map to a minimum scanner
 *   penetration level required to see through them:
 *
 *       body type   | min penetration to ignore
 *       ────────────┼──────────────────────────
 *       asteroid    | 1
 *       moon        | 1
 *       planet      | 2
 *       star        | 3
 *       station     | 0  (always opaque — scanners can't penetrate hulls)
 *
 *   A body with required penetration > scanner.penetrationLevel is treated as
 *   an opaque obstacle.  The actual blocking check uses a ray-segment / circle
 *   intersection test to confirm the body physically sits between source and
 *   target.
 *
 * • Focus invariant — at most one lock is "focused" (isFocused === true) at
 *   any time.  When a focused lock is broken the manager automatically shifts
 *   focus to the next lock in chronological order.
 *
 * • Quick-lock ("/" key) — the "/" shortcut bypasses the lock-limit check by
 *   evicting the oldest lock when necessary, matching the product spec.
 *   Normal attemptLock respects the cap and returns "lock-limit-reached".
 *
 * Units: positions in km, consistent with CelestialBody and ShipPhysicsState.
 */

import type { CelestialBody } from "../../types/solarsystem";
import { Aggression } from "./types";
import type { ScannerEquipment, TargetLock, TargetingState } from "./types";

// ── Public companion types ────────────────────────────────────────────────────

/**
 * Minimal enemy description required by TargetLockManager.quickLockNearestHostile.
 *
 * Callers supply this slice of enemy state so the manager does not need a
 * direct reference to EnemyManager or EnemyWithScanner.
 */
export interface EnemyInfo {
	/** Unique entity identifier. */
	id: string;
	/** Display name for HUD rendering. */
	name: string;
	/** World-space position (km). */
	position: { x: number; y: number };
	/** Current aggression level — only VIGILANT and HOSTILE are eligible. */
	aggression: Aggression;
}

/**
 * Result of a lock attempt (attemptLock or quickLockNearestHostile).
 *
 * When `success` is false `reason` identifies the blocking gate so the HUD
 * can display an appropriate message.
 */
export interface LockAttemptResult {
	success: boolean;
	/** Present when `success` is true. */
	lock?: TargetLock;
	/**
	 * Present when `success` is false.
	 *   "out-of-range"       — target is further than scanner.range
	 *   "penetration-blocked" — a celestial body blocks line-of-sight
	 *   "lock-limit-reached" — allLocks.length >= scanner.maxSimultaneousLocks
	 *   "no-hostile-target"  — "/" key pressed but no aggro'd enemy in range
	 */
	reason?:
		| "out-of-range"
		| "penetration-blocked"
		| "lock-limit-reached"
		| "no-hostile-target";
}

// ── Internal constants ────────────────────────────────────────────────────────

/**
 * Maps CelestialBody.type → minimum scanner penetrationLevel required to see
 * through that body.  If scanner.penetrationLevel < this value, the body
 * blocks line-of-sight and the ray-circle test is performed.
 *
 * Stations use Infinity so that no scanner (max spec level = 3) can ever
 * penetrate a station's hull — they are always opaque obstacles.
 */
const BODY_MIN_PENETRATION: Record<CelestialBody["type"], number> = {
	asteroid: 1,
	moon: 1,
	planet: 2,
	star: 3,
	station: Infinity, // no scanner can penetrate a station hull
};

// ── TargetLockManager ─────────────────────────────────────────────────────────

export class TargetLockManager {
	// ── Geometry helpers ───────────────────────────────────────────────────────

	/**
	 * Euclidean distance (km) between two world-space positions.
	 */
	static calculateDistance(
		pos1: { x: number; y: number },
		pos2: { x: number; y: number },
	): number {
		const dx = pos2.x - pos1.x;
		const dy = pos2.y - pos1.y;
		return Math.sqrt(dx * dx + dy * dy);
	}

	/**
	 * Ray-segment × circle intersection test.
	 *
	 * Returns true when the line **segment** from `p1` to `p2` passes through
	 * or overlaps the disc centred at `centre` with `radius`.
	 *
	 * The standard parametric form is used:
	 *   P(t) = p1 + t × (p2 − p1),  t ∈ [0, 1]
	 *
	 * A point P(t) is inside the circle when |P(t) − centre|² ≤ radius².
	 * Substituting and solving gives a quadratic in t; the discriminant
	 * determines whether any real intersection exists.  We then check if the
	 * circle's "extent" along the segment overlaps [0, 1]:
	 *   • t2 ≥ 0 : exit point is not before the start
	 *   • t1 ≤ 1 : entry point is not past the end
	 *
	 * This correctly handles the case where one or both endpoints are inside
	 * the circle.
	 *
	 * @param p1     Segment start (km).
	 * @param p2     Segment end (km).
	 * @param centre Circle centre (km).
	 * @param radius Circle radius (km).
	 */
	static rayCircleIntersects(
		p1: { x: number; y: number },
		p2: { x: number; y: number },
		centre: { x: number; y: number },
		radius: number,
	): boolean {
		const dx = p2.x - p1.x;
		const dy = p2.y - p1.y;
		const fx = p1.x - centre.x;
		const fy = p1.y - centre.y;

		const a = dx * dx + dy * dy;
		if (a === 0) return false; // Zero-length segment — no travel, no block.

		const b = 2 * (fx * dx + fy * dy);
		const c = fx * fx + fy * fy - radius * radius;

		const discriminant = b * b - 4 * a * c;
		if (discriminant < 0) return false; // No real intersection with the circle.

		const sqrtDisc = Math.sqrt(discriminant);
		const t1 = (-b - sqrtDisc) / (2 * a); // Entry into circle
		const t2 = (-b + sqrtDisc) / (2 * a); // Exit from circle

		// Blocked if the circle overlaps the segment [0, 1].
		return t1 <= 1 && t2 >= 0;
	}

	/**
	 * Check whether a celestial body blocks the line-of-sight from `sourcePos`
	 * to `targetPos` given the scanner's penetration level.
	 *
	 * A body blocks if:
	 *   1. The scanner cannot penetrate it (penetrationLevel < body's minimum).
	 *   2. The body physically intersects the path (ray-circle test).
	 *
	 * @param sourcePos        Scanner position (km).
	 * @param targetPos        Target position (km).
	 * @param body             Celestial body to test against.
	 * @param penetrationLevel Scanner's penetration capability (0–3).
	 */
	static isLineOfSightBlocked(
		sourcePos: { x: number; y: number },
		targetPos: { x: number; y: number },
		body: CelestialBody,
		penetrationLevel: number,
	): boolean {
		const minRequired = BODY_MIN_PENETRATION[body.type] ?? 0;

		// If the scanner can see through this body type, it never blocks.
		if (penetrationLevel >= minRequired) return false;

		// Body type is opaque to this scanner — check if it physically intercepts.
		return TargetLockManager.rayCircleIntersects(
			sourcePos,
			targetPos,
			body.position,
			body.radius,
		);
	}

	// ── State factory ──────────────────────────────────────────────────────────

	/**
	 * Create a fresh, empty TargetingState.
	 * Use this when initialising a new ship or resetting after docking.
	 */
	static createTargetingState(): TargetingState {
		return {
			allLocks: [],
			lastTabCycleMs: 0,
			lastClickLockMs: 0,
		};
	}

	// ── Lock validation ────────────────────────────────────────────────────────

	/**
	 * Check whether a single existing lock remains valid.
	 *
	 * A lock is valid when:
	 *   • The target is within scanner.range.
	 *   • No celestial body blocks line-of-sight at the current scanner
	 *     penetration level.
	 *
	 * @param lock       The lock to validate.
	 * @param sourcePos  Current position of the locking ship (km).
	 * @param targetPos  Current position of the target (km).
	 * @param scanner    Scanner equipment of the locking ship.
	 * @param obstacles  Celestial bodies to test for obstruction.
	 */
	static validateLock(
		_lock: TargetLock,
		sourcePos: { x: number; y: number },
		targetPos: { x: number; y: number },
		scanner: ScannerEquipment,
		obstacles: CelestialBody[],
	): boolean {
		const distance = TargetLockManager.calculateDistance(sourcePos, targetPos);
		if (distance > scanner.range) return false;

		for (const body of obstacles) {
			if (
				TargetLockManager.isLineOfSightBlocked(
					sourcePos,
					targetPos,
					body,
					scanner.penetrationLevel,
				)
			) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Validate all active locks, removing any that are no longer reachable.
	 *
	 * For each lock, `getTargetPos` is called to retrieve the current target
	 * position.  A null return means the target has been destroyed — the lock
	 * is broken immediately.  If a still-alive target has drifted out of range
	 * or is now occluded, its lock is also broken.
	 *
	 * distanceKm on surviving locks is refreshed so the HUD always shows an
	 * accurate value.
	 *
	 * @param state         Targeting state to mutate.
	 * @param sourcePos     Current locking-ship position (km).
	 * @param getTargetPos  Callback that resolves a targetId → world position.
	 *                      Return null when the entity no longer exists.
	 * @param scanner       Scanner equipment of the locking ship.
	 * @param obstacles     Celestial bodies to test for obstruction.
	 * @returns Array of lock ids that were broken.
	 */
	static validateAllLocks(
		state: TargetingState,
		sourcePos: { x: number; y: number },
		getTargetPos: (targetId: string) => { x: number; y: number } | null,
		scanner: ScannerEquipment,
		obstacles: CelestialBody[],
	): string[] {
		const brokenIds: string[] = [];

		// Collect invalid lock ids (do not splice while iterating).
		for (const lock of state.allLocks) {
			const targetPos = getTargetPos(lock.targetId);

			if (targetPos === null) {
				// Target destroyed.
				brokenIds.push(lock.id);
				continue;
			}

			const distance = TargetLockManager.calculateDistance(sourcePos, targetPos);
			// Refresh distance for HUD display regardless of validity.
			lock.distanceKm = distance;

			if (
				!TargetLockManager.validateLock(
					lock,
					sourcePos,
					targetPos,
					scanner,
					obstacles,
				)
			) {
				brokenIds.push(lock.id);
			}
		}

		for (const id of brokenIds) {
			TargetLockManager.breakLock(state, id);
		}

		return brokenIds;
	}

	// ── Lock lifecycle ─────────────────────────────────────────────────────────

	/**
	 * Attempt to lock a target.
	 *
	 * Applies three sequential gates (same priority order as canDock):
	 *   1. Lock-limit — allLocks.length < scanner.maxSimultaneousLocks
	 *   2. Range      — Euclidean distance ≤ scanner.range
	 *   3. Line-of-sight — no blocking celestial body
	 *
	 * If the target is already locked, the existing lock is returned as a
	 * success without creating a duplicate.
	 *
	 * The first lock acquired is automatically made the focused lock.
	 *
	 * @param state      Targeting state to mutate.
	 * @param sourcePos  Position of the locking ship (km).
	 * @param target     Target entity descriptor.
	 * @param scanner    Scanner equipment of the locking ship.
	 * @param obstacles  Celestial bodies to test for obstruction.
	 * @param nowMs      Current simulation timestamp (default: Date.now()).
	 */
	static attemptLock(
		state: TargetingState,
		sourcePos: { x: number; y: number },
		target: { id: string; name: string; position: { x: number; y: number } },
		scanner: ScannerEquipment,
		obstacles: CelestialBody[],
		nowMs: number = Date.now(),
	): LockAttemptResult {
		// Already locked — return existing lock without duplicating.
		const existing = state.allLocks.find((l) => l.targetId === target.id);
		if (existing) {
			return { success: true, lock: existing };
		}

		// Gate 1: max lock limit.
		if (state.allLocks.length >= scanner.maxSimultaneousLocks) {
			return { success: false, reason: "lock-limit-reached" };
		}

		// Gate 2: scanner range.
		const distance = TargetLockManager.calculateDistance(sourcePos, target.position);
		if (distance > scanner.range) {
			return { success: false, reason: "out-of-range" };
		}

		// Gate 3: line-of-sight / penetration.
		for (const body of obstacles) {
			if (
				TargetLockManager.isLineOfSightBlocked(
					sourcePos,
					target.position,
					body,
					scanner.penetrationLevel,
				)
			) {
				return { success: false, reason: "penetration-blocked" };
			}
		}

		// All gates passed — create the lock.
		const isFirst = state.allLocks.length === 0;
		const lock: TargetLock = {
			id: `lock-${target.id}-${nowMs}`,
			targetId: target.id,
			targetName: target.name,
			lockedAtMs: nowMs,
			distanceKm: distance,
			isFocused: isFirst,
			lockStrength: 1.0,
		};

		state.allLocks.push(lock);
		if (isFirst) {
			state.focusedLockId = lock.id;
		}

		return { success: true, lock };
	}

	/**
	 * Break (remove) a lock by id.
	 *
	 * If the broken lock was focused, focus automatically shifts to the lock
	 * at the same array index (or the last lock if the broken one was last).
	 * If no locks remain, focusedLockId is cleared.
	 *
	 * @param state  Targeting state to mutate.
	 * @param lockId Id of the lock to remove.
	 */
	static breakLock(state: TargetingState, lockId: string): void {
		const idx = state.allLocks.findIndex((l) => l.id === lockId);
		if (idx === -1) return;

		const wasFocused = state.allLocks[idx]!.isFocused;
		state.allLocks.splice(idx, 1);

		if (!wasFocused || state.allLocks.length === 0) {
			// Unfocused lock removed — no focus reassignment needed (or nothing left).
			if (state.allLocks.length === 0) {
				state.focusedLockId = undefined;
			}
			return;
		}

		// Shift focus to the lock at the same position (or last if deleted at end).
		const nextIdx = Math.min(idx, state.allLocks.length - 1);
		for (const l of state.allLocks) l.isFocused = false;
		const nextLock = state.allLocks[nextIdx]!;
		nextLock.isFocused = true;
		state.focusedLockId = nextLock.id;
	}

	/**
	 * Called when a target entity is destroyed.
	 *
	 * Finds and breaks any lock that tracks `targetId`, applying the standard
	 * focus-shift logic so combat flow is never interrupted by a kill.
	 *
	 * @param state    Targeting state to mutate.
	 * @param targetId Id of the destroyed entity.
	 */
	static onTargetDestroyed(state: TargetingState, targetId: string): void {
		const lock = state.allLocks.find((l) => l.targetId === targetId);
		if (lock) TargetLockManager.breakLock(state, lock.id);
	}

	// ── Focus management ───────────────────────────────────────────────────────

	/**
	 * Cycle the focused lock to the next entry in allLocks (Tab key).
	 *
	 * Wraps around cyclically.  Has no effect when there are no locks.
	 *
	 * @param state  Targeting state to mutate.
	 * @param nowMs  Current simulation timestamp (default: Date.now()).
	 */
	static cycleFocusedLock(
		state: TargetingState,
		nowMs: number = Date.now(),
	): void {
		if (state.allLocks.length === 0) return;

		state.lastTabCycleMs = nowMs;

		const currentIdx = state.allLocks.findIndex((l) => l.isFocused);
		const nextIdx =
			currentIdx === -1 ? 0 : (currentIdx + 1) % state.allLocks.length;

		for (const l of state.allLocks) l.isFocused = false;
		const nextLock = state.allLocks[nextIdx]!;
		nextLock.isFocused = true;
		state.focusedLockId = nextLock.id;
	}

	/**
	 * Set focus to a specific lock by id (HUD lock-indicator click).
	 *
	 * Does not break any other locks — all remaining locks stay active but
	 * only the chosen one is marked focused.
	 *
	 * @param state  Targeting state to mutate.
	 * @param lockId Id of the lock to focus.
	 * @param nowMs  Current simulation timestamp (default: Date.now()).
	 * @returns true when the lock was found and focused; false when not found.
	 */
	static setFocusedLock(
		state: TargetingState,
		lockId: string,
		nowMs: number = Date.now(),
	): boolean {
		const lock = state.allLocks.find((l) => l.id === lockId);
		if (!lock) return false;

		state.lastClickLockMs = nowMs;
		for (const l of state.allLocks) l.isFocused = false;
		lock.isFocused = true;
		state.focusedLockId = lockId;
		return true;
	}

	// ── Quick-lock ("/" key) ───────────────────────────────────────────────────

	/**
	 * Lock the nearest aggro'd enemy within scanner range ("/" key action).
	 *
	 * Selection criteria (in order):
	 *   1. Enemy must be VIGILANT or HOSTILE (never NEUTRAL).
	 *   2. Enemy must be within scanner.range.
	 *   3. Line-of-sight must be clear at the scanner's penetration level.
	 *   4. Among valid candidates, the closest by Euclidean distance wins.
	 *
	 * If the winner is already locked, its lock is refocused and returned.
	 *
	 * If the winner is not yet locked and allLocks is already at capacity, the
	 * **oldest** lock (lowest lockedAtMs) is evicted to make room — matching
	 * the product spec's behaviour for the "/" shortcut.
	 *
	 * The resulting lock is automatically made the focused lock.
	 *
	 * @param state      Targeting state to mutate.
	 * @param sourcePos  Current position of the locking ship (km).
	 * @param enemies    All visible enemies with their aggression states.
	 * @param scanner    Scanner equipment of the locking ship.
	 * @param obstacles  Celestial bodies to test for obstruction.
	 * @param nowMs      Current simulation timestamp (default: Date.now()).
	 */
	static quickLockNearestHostile(
		state: TargetingState,
		sourcePos: { x: number; y: number },
		enemies: EnemyInfo[],
		scanner: ScannerEquipment,
		obstacles: CelestialBody[],
		nowMs: number = Date.now(),
	): LockAttemptResult {
		// Filter to aggro'd enemies only.
		const eligible = enemies.filter((e) => e.aggression !== Aggression.NEUTRAL);
		if (eligible.length === 0) {
			return { success: false, reason: "no-hostile-target" };
		}

		// Sort by Euclidean distance (ascending) so the nearest comes first.
		const ranked = eligible
			.map((e) => ({
				enemy: e,
				distance: TargetLockManager.calculateDistance(sourcePos, e.position),
			}))
			.sort((a, b) => a.distance - b.distance);

		// Find the nearest candidate that passes range + LOS gates.
		for (const { enemy, distance } of ranked) {
			if (distance > scanner.range) continue; // All further candidates also fail.

			let blocked = false;
			for (const body of obstacles) {
				if (
					TargetLockManager.isLineOfSightBlocked(
						sourcePos,
						enemy.position,
						body,
						scanner.penetrationLevel,
					)
				) {
					blocked = true;
					break;
				}
			}
			if (blocked) continue;

			// Valid candidate found.

			// If already locked, just refocus and return.
			const existing = state.allLocks.find((l) => l.targetId === enemy.id);
			if (existing) {
				TargetLockManager.setFocusedLock(state, existing.id, nowMs);
				return { success: true, lock: existing };
			}

			// Need a new lock — evict oldest if at capacity.
			if (state.allLocks.length >= scanner.maxSimultaneousLocks) {
				const oldest = state.allLocks.reduce((a, b) =>
					a.lockedAtMs <= b.lockedAtMs ? a : b,
				);
				TargetLockManager.breakLock(state, oldest.id);
			}

			// Clear any existing focus before adding the new lock.
			for (const l of state.allLocks) l.isFocused = false;

			const lock: TargetLock = {
				id: `lock-${enemy.id}-${nowMs}`,
				targetId: enemy.id,
				targetName: enemy.name,
				lockedAtMs: nowMs,
				distanceKm: distance,
				isFocused: true,
				lockStrength: 1.0,
			};

			state.allLocks.push(lock);
			state.focusedLockId = lock.id;

			return { success: true, lock };
		}

		// No valid candidate within range.
		return { success: false, reason: "no-hostile-target" };
	}
}
