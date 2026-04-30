/**
 * Tests for TargetLockManager
 *
 * Integration-first, no mocks: TargetLockManager is a pure-logic module with
 * no I/O boundaries.  All collaborators (ScannerEquipment, TargetingState,
 * CelestialBody, EnemyInfo) are constructed inline from real type data.
 * GravitySystem is not involved here; the only external type used is
 * CelestialBody from solarsystem — imported as a pure type, no runtime deps.
 *
 * Observable contracts under test
 * ────────────────────────────────
 *
 * calculateDistance
 *   D1.  Origin to point → correct Euclidean distance.
 *   D2.  Identical points → 0.
 *   D3.  Negative-coordinate points → same magnitude as positive.
 *
 * rayCircleIntersects
 *   R1.  Segment through centre → true.
 *   R2.  Segment tangent to circle → true (touches edge).
 *   R3.  Segment misses circle → false.
 *   R4.  Zero-length segment → false (never blocks).
 *   R5.  Segment starts inside circle and ends outside → true.
 *   R6.  Both endpoints outside but circle fully between them → true.
 *   R7.  Circle is behind p1 (no overlap with [0,1]) → false.
 *   R8.  Circle is beyond p2 (no overlap with [0,1]) → false.
 *
 * isLineOfSightBlocked
 *   L1.  Moon on the path, scanner pen 0 → blocked.
 *   L2.  Moon on the path, scanner pen 1 → NOT blocked (penetrates moons).
 *   L3.  Planet on the path, scanner pen 1 → blocked.
 *   L4.  Planet on the path, scanner pen 2 → NOT blocked.
 *   L5.  Star on the path, scanner pen 2 → blocked.
 *   L6.  Star on the path, scanner pen 3 → NOT blocked.
 *   L7.  Asteroid on path, scanner pen 0 → blocked.
 *   L8.  Asteroid on path, scanner pen 1 → NOT blocked.
 *   L9.  Station on path, scanner pen 0 → blocked.
 *  L10.  Station on path, scanner pen 3 → still blocked (no penetration level
 *        defeats a station hull).
 *  L11.  Body is not on the path (off to the side) → false regardless of type.
 *
 * attemptLock — happy path
 *   A1.  Lock a reachable target → success, lock added to state, isFocused.
 *   A2.  First lock is automatically focused (focusedLockId set).
 *   A3.  Second lock added → not focused by default; first stays focused.
 *   A4.  Attempting to lock an already-locked target → returns existing lock.
 *
 * attemptLock — unhappy branches
 *   A5.  Target beyond scanner range → "out-of-range".
 *   A6.  Target occluded by blocking body → "penetration-blocked".
 *   A7.  Max simultaneous lock limit reached → "lock-limit-reached".
 *   A8.  Body not on line-of-sight path → does NOT block the lock.
 *
 * validateLock
 *   V1.  Lock in range, clear LOS → valid.
 *   V2.  Lock in range but blocked by body → invalid.
 *   V3.  Lock out of range → invalid.
 *
 * validateAllLocks
 *  VA1.  All locks valid → no breaks; distances are refreshed.
 *  VA2.  One lock drifts out of range → that lock is broken, focus shifts.
 *  VA3.  Target position resolves to null → lock broken (target destroyed).
 *  VA4.  Multiple invalid locks → all removed, returns all broken ids.
 *
 * breakLock
 *   B1.  Breaking a non-focused lock → other locks unaffected, focus unchanged.
 *   B2.  Breaking the focused lock with others remaining → focus shifts to next.
 *   B3.  Breaking the last lock → state is empty, focusedLockId undefined.
 *   B4.  Breaking a non-existent lockId → no-op, state unchanged.
 *
 * cycleFocusedLock (Tab key)
 *   C1.  Single lock → Tab has no visual effect (same lock stays focused).
 *   C2.  Three locks → Tab cycles forward through all, wraps around.
 *   C3.  No locks → no-op, no crash.
 *   C4.  lastTabCycleMs is updated on each cycle.
 *
 * setFocusedLock (HUD click)
 *   S1.  Click a non-focused lock → it becomes focused, others lose focus.
 *   S2.  Click the already-focused lock → remains focused (idempotent).
 *   S3.  Click unknown lockId → returns false, state unchanged.
 *   S4.  lastClickLockMs is updated on success.
 *
 * onTargetDestroyed
 *   OD1. Destroying the focused target auto-focuses next lock.
 *   OD2. Destroying a non-focused target leaves focus unchanged.
 *   OD3. Destroying the only locked target leaves empty state.
 *   OD4. Destroying an id that is not locked → no-op.
 *
 * quickLockNearestHostile ("/" key)
 *   Q1.  Single hostile in range → locked and focused.
 *   Q2.  Multiple hostiles → nearest (by Euclidean distance) is chosen.
 *   Q3.  No hostile/vigilant enemies → "no-hostile-target".
 *   Q4.  Only neutral enemies → "no-hostile-target".
 *   Q5.  Hostile in range but occluded → skipped, next candidate chosen.
 *   Q6.  Hostile already locked → refocused without duplicating the lock.
 *   Q7.  At max lock limit → oldest lock evicted to make room.
 *   Q8.  All hostiles out of range → "no-hostile-target".
 *   Q9.  VIGILANT enemies qualify for quick-lock.
 *  Q10.  Resulting lock is always focused regardless of prior focus state.
 */

import { describe, expect, it } from "vitest";
import { TargetLockManager } from "./TargetLockManager";
import type { EnemyInfo } from "./TargetLockManager";
import { Aggression } from "./types";
import type { ScannerEquipment, TargetingState } from "./types";
import type { CelestialBody } from "../../types/solarsystem";

// ── Shared test helpers ───────────────────────────────────────────────────────

/** Orbital stub — only required to satisfy the CelestialBody type shape. */
const STUB_ORBITAL: CelestialBody["orbital"] = {
	parentId: "star-1",
	semiMajorAxis: 100_000,
	eccentricity: 0,
	inclination: 0,
	longitudeAscendingNode: 0,
	argumentOfPeriapsis: 0,
	meanAnomalyAtEpoch: 0,
	orbitalPeriodMs: 1e10,
	currentAnomaly: 0,
};

function makeBody(
	overrides: Partial<CelestialBody> & { type: CelestialBody["type"] },
): CelestialBody {
	return {
		id: "body-test",
		name: "Test Body",
		position: { x: 0, y: 0 },
		radius: 10,
		mass: 5e24,
		gravityStrength: 9.8,
		color: { r: 128, g: 128, b: 128 },
		orbital: STUB_ORBITAL,
		isPrimaryGravitySource: false,
		...overrides,
	};
}

function makeScanner(overrides: Partial<ScannerEquipment> = {}): ScannerEquipment {
	return {
		id: "scanner-test",
		name: "Test Scanner",
		range: 500,
		penetrationLevel: 0,
		maxSimultaneousLocks: 3,
		...overrides,
	};
}

function makeState(): TargetingState {
	return TargetLockManager.createTargetingState();
}

function makeTarget(
	id: string,
	pos: { x: number; y: number } = { x: 100, y: 0 },
	name = `Enemy-${id}`,
) {
	return { id, name, position: pos };
}

function makeEnemy(
	id: string,
	pos: { x: number; y: number },
	aggression: Aggression = Aggression.HOSTILE,
	name = `Enemy-${id}`,
): EnemyInfo {
	return { id, name, position: pos, aggression };
}

// ── calculateDistance ─────────────────────────────────────────────────────────

describe("TargetLockManager.calculateDistance", () => {
	it("D1 — computes correct Euclidean distance from origin", () => {
		// Given positions at (0,0) and (3,4)
		// When
		const d = TargetLockManager.calculateDistance({ x: 0, y: 0 }, { x: 3, y: 4 });
		// Then — Pythagorean 3-4-5 triple
		expect(d).toBeCloseTo(5, 6);
	});

	it("D2 — identical positions yield 0", () => {
		const d = TargetLockManager.calculateDistance({ x: 7, y: -3 }, { x: 7, y: -3 });
		expect(d).toBe(0);
	});

	it("D3 — negative-coordinate points give same magnitude as positive mirror", () => {
		const positive = TargetLockManager.calculateDistance({ x: 0, y: 0 }, { x: 6, y: 8 });
		const negative = TargetLockManager.calculateDistance({ x: 0, y: 0 }, { x: -6, y: -8 });
		expect(positive).toBeCloseTo(negative, 6);
	});
});

// ── rayCircleIntersects ───────────────────────────────────────────────────────

describe("TargetLockManager.rayCircleIntersects", () => {
	const origin = { x: 0, y: 0 };
	const circle = { x: 5, y: 0 };
	const r = 2;

	it("R1 — segment through circle centre → true", () => {
		expect(
			TargetLockManager.rayCircleIntersects(origin, { x: 10, y: 0 }, circle, r),
		).toBe(true);
	});

	it("R2 — segment tangent to circle (exactly touching edge) → true", () => {
		// Segment from (0, 2) to (10, 2) — touches the top of circle at (5,0) r=2
		expect(
			TargetLockManager.rayCircleIntersects({ x: 0, y: 2 }, { x: 10, y: 2 }, circle, r),
		).toBe(true);
	});

	it("R3 — segment misses circle → false", () => {
		// Segment from (0, 3) to (10, 3) — passes above circle (top is at y=2)
		expect(
			TargetLockManager.rayCircleIntersects({ x: 0, y: 3 }, { x: 10, y: 3 }, circle, r),
		).toBe(false);
	});

	it("R4 — zero-length segment → false", () => {
		expect(
			TargetLockManager.rayCircleIntersects(origin, origin, circle, r),
		).toBe(false);
	});

	it("R5 — segment starts inside circle and ends outside → true", () => {
		// Start at (5,0) which is the circle centre (inside)
		expect(
			TargetLockManager.rayCircleIntersects({ x: 5, y: 0 }, { x: 20, y: 0 }, circle, r),
		).toBe(true);
	});

	it("R6 — segment starts before circle and ends after it (circle between endpoints) → true", () => {
		expect(
			TargetLockManager.rayCircleIntersects({ x: 0, y: 0 }, { x: 15, y: 0 }, circle, r),
		).toBe(true);
	});

	it("R7 — circle is behind p1 (t2 < 0) → false", () => {
		// Segment from (10,0) going right; circle is at (5,0) — behind the start
		expect(
			TargetLockManager.rayCircleIntersects({ x: 10, y: 0 }, { x: 20, y: 0 }, circle, r),
		).toBe(false);
	});

	it("R8 — circle is beyond p2 (t1 > 1) → false", () => {
		// Segment from (0,0) to (2,0); circle is at (5,0) with r=2 — segment ends before circle
		expect(
			TargetLockManager.rayCircleIntersects({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 5, y: 0 }, 1),
		).toBe(false);
	});
});

// ── isLineOfSightBlocked ──────────────────────────────────────────────────────

describe("TargetLockManager.isLineOfSightBlocked", () => {
	// Source at (0,0), target at (100,0), blocking body centred at (50,0) r=10
	const src = { x: 0, y: 0 };
	const tgt = { x: 100, y: 0 };
	const bodyPos = { x: 50, y: 0 };

	function onPath(type: CelestialBody["type"]): CelestialBody {
		return makeBody({ type, position: bodyPos, radius: 10 });
	}

	it("L1 — moon on path, pen 0 → blocked", () => {
		expect(TargetLockManager.isLineOfSightBlocked(src, tgt, onPath("moon"), 0)).toBe(true);
	});

	it("L2 — moon on path, pen 1 → not blocked (penetrates moons)", () => {
		expect(TargetLockManager.isLineOfSightBlocked(src, tgt, onPath("moon"), 1)).toBe(false);
	});

	it("L3 — planet on path, pen 1 → blocked", () => {
		expect(TargetLockManager.isLineOfSightBlocked(src, tgt, onPath("planet"), 1)).toBe(true);
	});

	it("L4 — planet on path, pen 2 → not blocked", () => {
		expect(TargetLockManager.isLineOfSightBlocked(src, tgt, onPath("planet"), 2)).toBe(false);
	});

	it("L5 — star on path, pen 2 → blocked", () => {
		expect(TargetLockManager.isLineOfSightBlocked(src, tgt, onPath("star"), 2)).toBe(true);
	});

	it("L6 — star on path, pen 3 → not blocked", () => {
		expect(TargetLockManager.isLineOfSightBlocked(src, tgt, onPath("star"), 3)).toBe(false);
	});

	it("L7 — asteroid on path, pen 0 → blocked", () => {
		expect(TargetLockManager.isLineOfSightBlocked(src, tgt, onPath("asteroid"), 0)).toBe(true);
	});

	it("L8 — asteroid on path, pen 1 → not blocked", () => {
		expect(TargetLockManager.isLineOfSightBlocked(src, tgt, onPath("asteroid"), 1)).toBe(false);
	});

	it("L9 — station on path, pen 0 → blocked", () => {
		expect(TargetLockManager.isLineOfSightBlocked(src, tgt, onPath("station"), 0)).toBe(true);
	});

	it("L10 — station on path, pen 3 → still blocked (stations are always opaque)", () => {
		expect(TargetLockManager.isLineOfSightBlocked(src, tgt, onPath("station"), 3)).toBe(true);
	});

	it("L11 — body off to the side of the path → false regardless of type", () => {
		// Body is 50 km off to the side — far from the direct line (0,0)→(100,0)
		const offSide = makeBody({ type: "planet", position: { x: 50, y: 60 }, radius: 10 });
		expect(TargetLockManager.isLineOfSightBlocked(src, tgt, offSide, 0)).toBe(false);
	});
});

// ── attemptLock — happy paths ─────────────────────────────────────────────────

describe("TargetLockManager.attemptLock — happy path", () => {
	it("A1 — locks a reachable target: success, lock added, correct fields", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner({ range: 500 });
		const target = makeTarget("e1", { x: 100, y: 0 });
		// When
		const result = TargetLockManager.attemptLock(
			state, { x: 0, y: 0 }, target, scanner, [], 1000,
		);
		// Then
		expect(result.success).toBe(true);
		expect(result.lock).toBeDefined();
		expect(result.lock!.targetId).toBe("e1");
		expect(result.lock!.targetName).toBe("Enemy-e1");
		expect(result.lock!.distanceKm).toBeCloseTo(100, 4);
		expect(result.lock!.lockedAtMs).toBe(1000);
		expect(result.lock!.lockStrength).toBe(1.0);
		expect(state.allLocks).toHaveLength(1);
		expect(state.allLocks[0]).toBe(result.lock);
	});

	it("A2 — first lock is automatically focused", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner();
		// When
		const result = TargetLockManager.attemptLock(
			state, { x: 0, y: 0 }, makeTarget("e1"), scanner, [], 1000,
		);
		// Then
		expect(result.lock!.isFocused).toBe(true);
		expect(state.focusedLockId).toBe(result.lock!.id);
	});

	it("A3 — second lock is not focused; first lock retains focus", () => {
		// Given — first lock
		const state = makeState();
		const scanner = makeScanner({ maxSimultaneousLocks: 3 });
		const r1 = TargetLockManager.attemptLock(
			state, { x: 0, y: 0 }, makeTarget("e1", { x: 50, y: 0 }), scanner, [], 1000,
		);
		// When — second lock
		const r2 = TargetLockManager.attemptLock(
			state, { x: 0, y: 0 }, makeTarget("e2", { x: 80, y: 0 }), scanner, [], 2000,
		);
		// Then
		expect(r2.success).toBe(true);
		expect(r2.lock!.isFocused).toBe(false);
		expect(r1.lock!.isFocused).toBe(true);
		expect(state.focusedLockId).toBe(r1.lock!.id);
		expect(state.allLocks).toHaveLength(2);
	});

	it("A4 — locking an already-locked target returns existing lock without duplicate", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner();
		const first = TargetLockManager.attemptLock(
			state, { x: 0, y: 0 }, makeTarget("e1"), scanner, [], 1000,
		);
		// When — same target again
		const second = TargetLockManager.attemptLock(
			state, { x: 0, y: 0 }, makeTarget("e1"), scanner, [], 2000,
		);
		// Then — same lock object returned, no duplicate
		expect(second.success).toBe(true);
		expect(second.lock!.id).toBe(first.lock!.id);
		expect(state.allLocks).toHaveLength(1);
	});
});

// ── attemptLock — unhappy branches ────────────────────────────────────────────

describe("TargetLockManager.attemptLock — unhappy branches", () => {
	it("A5 — target beyond scanner range → out-of-range", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner({ range: 100 });
		const target = makeTarget("e1", { x: 200, y: 0 }); // 200 km away
		// When
		const result = TargetLockManager.attemptLock(
			state, { x: 0, y: 0 }, target, scanner, [], 1000,
		);
		// Then
		expect(result.success).toBe(false);
		expect(result.reason).toBe("out-of-range");
		expect(state.allLocks).toHaveLength(0);
	});

	it("A6 — target occluded by a blocking body → penetration-blocked", () => {
		// Given — planet sits directly between source and target; pen level 0
		const state = makeState();
		const scanner = makeScanner({ range: 500, penetrationLevel: 0 });
		const target = makeTarget("e1", { x: 100, y: 0 });
		const planet = makeBody({
			type: "planet",
			position: { x: 50, y: 0 },
			radius: 10,
		});
		// When
		const result = TargetLockManager.attemptLock(
			state, { x: 0, y: 0 }, target, scanner, [planet], 1000,
		);
		// Then
		expect(result.success).toBe(false);
		expect(result.reason).toBe("penetration-blocked");
		expect(state.allLocks).toHaveLength(0);
	});

	it("A7 — max simultaneous lock limit reached → lock-limit-reached", () => {
		// Given — fill 2-lock scanner to capacity
		const state = makeState();
		const scanner = makeScanner({ maxSimultaneousLocks: 2 });
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1", { x: 10, y: 0 }), scanner, [], 1000);
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e2", { x: 20, y: 0 }), scanner, [], 2000);
		// When — attempt a third lock
		const result = TargetLockManager.attemptLock(
			state, { x: 0, y: 0 }, makeTarget("e3", { x: 30, y: 0 }), scanner, [], 3000,
		);
		// Then
		expect(result.success).toBe(false);
		expect(result.reason).toBe("lock-limit-reached");
		expect(state.allLocks).toHaveLength(2);
	});

	it("A8 — body off the path does NOT block the lock", () => {
		// Given — moon is 50 km off to the side
		const state = makeState();
		const scanner = makeScanner({ range: 500, penetrationLevel: 0 });
		const target = makeTarget("e1", { x: 100, y: 0 });
		const moon = makeBody({ type: "moon", position: { x: 50, y: 60 }, radius: 10 });
		// When
		const result = TargetLockManager.attemptLock(
			state, { x: 0, y: 0 }, target, scanner, [moon], 1000,
		);
		// Then — moon off the path should not block
		expect(result.success).toBe(true);
	});
});

// ── validateLock ──────────────────────────────────────────────────────────────

describe("TargetLockManager.validateLock", () => {
	it("V1 — lock in range, clear LOS → valid", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner({ range: 500 });
		const r = TargetLockManager.attemptLock(
			state, { x: 0, y: 0 }, makeTarget("e1", { x: 100, y: 0 }), scanner, [], 1000,
		);
		// When
		const valid = TargetLockManager.validateLock(
			r.lock!, { x: 0, y: 0 }, { x: 100, y: 0 }, scanner, [],
		);
		// Then
		expect(valid).toBe(true);
	});

	it("V2 — lock in range but blocked by body → invalid", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner({ range: 500, penetrationLevel: 0 });
		const r = TargetLockManager.attemptLock(
			state, { x: 0, y: 0 }, makeTarget("e1", { x: 100, y: 0 }), scanner, [], 1000,
		);
		const planet = makeBody({ type: "planet", position: { x: 50, y: 0 }, radius: 10 });
		// When — planet now moves into the path
		const valid = TargetLockManager.validateLock(
			r.lock!, { x: 0, y: 0 }, { x: 100, y: 0 }, scanner, [planet],
		);
		// Then
		expect(valid).toBe(false);
	});

	it("V3 — target drifted out of range → invalid", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner({ range: 100 });
		const r = TargetLockManager.attemptLock(
			state, { x: 0, y: 0 }, makeTarget("e1", { x: 50, y: 0 }), scanner, [], 1000,
		);
		// When — target drifted to 200 km away
		const valid = TargetLockManager.validateLock(
			r.lock!, { x: 0, y: 0 }, { x: 200, y: 0 }, scanner, [],
		);
		// Then
		expect(valid).toBe(false);
	});
});

// ── validateAllLocks ──────────────────────────────────────────────────────────

describe("TargetLockManager.validateAllLocks", () => {
	it("VA1 — all locks valid → none broken; distances refreshed", () => {
		// Given — two targets at different positions
		const state = makeState();
		const scanner = makeScanner({ range: 500, maxSimultaneousLocks: 3 });
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1", { x: 100, y: 0 }), scanner, [], 1000);
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e2", { x: 200, y: 0 }), scanner, [], 2000);

		const positions: Record<string, { x: number; y: number }> = {
			e1: { x: 150, y: 0 }, // moved a bit
			e2: { x: 200, y: 0 },
		};
		// When
		const broken = TargetLockManager.validateAllLocks(
			state,
			{ x: 0, y: 0 },
			(id) => positions[id] ?? null,
			scanner,
			[],
		);
		// Then — nothing broken, distance updated for e1
		expect(broken).toHaveLength(0);
		expect(state.allLocks).toHaveLength(2);
		const e1Lock = state.allLocks.find((l) => l.targetId === "e1")!;
		expect(e1Lock.distanceKm).toBeCloseTo(150, 4);
	});

	it("VA2 — one lock drifts out of range → broken and focus shifts", () => {
		// Given — focused lock on e1 (closer), second lock on e2
		const state = makeState();
		const scanner = makeScanner({ range: 200, maxSimultaneousLocks: 3 });
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1", { x: 50, y: 0 }), scanner, [], 1000);
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e2", { x: 100, y: 0 }), scanner, [], 2000);

		// When — e1 drifts to 250 km (beyond 200 km range)
		const broken = TargetLockManager.validateAllLocks(
			state,
			{ x: 0, y: 0 },
			(id) => (id === "e1" ? { x: 250, y: 0 } : { x: 100, y: 0 }),
			scanner,
			[],
		);
		// Then — e1 lock broken, focus auto-shifted to e2
		expect(broken).toHaveLength(1);
		expect(broken[0]).toContain("e1");
		expect(state.allLocks).toHaveLength(1);
		expect(state.allLocks[0]!.targetId).toBe("e2");
		expect(state.allLocks[0]!.isFocused).toBe(true);
	});

	it("VA3 — target resolves to null (destroyed) → lock broken", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner();
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1", { x: 50, y: 0 }), scanner, [], 1000);
		// When — target no longer exists
		const broken = TargetLockManager.validateAllLocks(
			state,
			{ x: 0, y: 0 },
			() => null,
			scanner,
			[],
		);
		// Then
		expect(broken).toHaveLength(1);
		expect(state.allLocks).toHaveLength(0);
		expect(state.focusedLockId).toBeUndefined();
	});

	it("VA4 — multiple invalid locks → all removed, all ids returned", () => {
		// Given — three locks, all targets go out of range
		const state = makeState();
		const scanner = makeScanner({ range: 100, maxSimultaneousLocks: 3 });
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1", { x: 50, y: 0 }), scanner, [], 1000);
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e2", { x: 60, y: 0 }), scanner, [], 2000);
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e3", { x: 70, y: 0 }), scanner, [], 3000);
		// When
		const broken = TargetLockManager.validateAllLocks(
			state,
			{ x: 0, y: 0 },
			(id) => ({ e1: { x: 200, y: 0 }, e2: { x: 200, y: 0 }, e3: { x: 200, y: 0 } }[id] ?? null),
			scanner,
			[],
		);
		// Then
		expect(broken).toHaveLength(3);
		expect(state.allLocks).toHaveLength(0);
		expect(state.focusedLockId).toBeUndefined();
	});
});

// ── breakLock ────────────────────────────────────────────────────────────────

describe("TargetLockManager.breakLock", () => {
	it("B1 — breaking a non-focused lock leaves other locks and focus unchanged", () => {
		// Given — two locks; first is focused, second is not
		const state = makeState();
		const scanner = makeScanner({ maxSimultaneousLocks: 3 });
		const r1 = TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1"), scanner, [], 1000);
		const r2 = TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e2", { x: 50, y: 0 }), scanner, [], 2000);
		// When — break the non-focused second lock
		TargetLockManager.breakLock(state, r2.lock!.id);
		// Then — only e1 remains, still focused
		expect(state.allLocks).toHaveLength(1);
		expect(state.allLocks[0]!.targetId).toBe("e1");
		expect(state.allLocks[0]!.isFocused).toBe(true);
		expect(state.focusedLockId).toBe(r1.lock!.id);
	});

	it("B2 — breaking the focused lock shifts focus to next remaining lock", () => {
		// Given — three locks; e1 focused
		const state = makeState();
		const scanner = makeScanner({ maxSimultaneousLocks: 3 });
		const r1 = TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1", { x: 10, y: 0 }), scanner, [], 1000);
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e2", { x: 20, y: 0 }), scanner, [], 2000);
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e3", { x: 30, y: 0 }), scanner, [], 3000);
		// When — break focused e1 lock
		TargetLockManager.breakLock(state, r1.lock!.id);
		// Then — two locks remain; e2 (now at index 0) should be focused
		expect(state.allLocks).toHaveLength(2);
		const focusedLock = state.allLocks.find((l) => l.isFocused);
		expect(focusedLock).toBeDefined();
		expect(focusedLock!.targetId).toBe("e2");
		expect(state.focusedLockId).toBe(focusedLock!.id);
	});

	it("B3 — breaking the last lock leaves state empty", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner();
		const r = TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1"), scanner, [], 1000);
		// When
		TargetLockManager.breakLock(state, r.lock!.id);
		// Then
		expect(state.allLocks).toHaveLength(0);
		expect(state.focusedLockId).toBeUndefined();
	});

	it("B4 — breaking a non-existent lockId is a no-op", () => {
		// Given — one lock
		const state = makeState();
		const scanner = makeScanner();
		const r = TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1"), scanner, [], 1000);
		// When — break a random id
		TargetLockManager.breakLock(state, "nonexistent-lock");
		// Then — state unchanged
		expect(state.allLocks).toHaveLength(1);
		expect(state.focusedLockId).toBe(r.lock!.id);
	});
});

// ── cycleFocusedLock (Tab) ────────────────────────────────────────────────────

describe("TargetLockManager.cycleFocusedLock — Tab key", () => {
	it("C1 — single lock: Tab re-focuses the same lock (no visible change)", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner();
		const r = TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1"), scanner, [], 1000);
		// When
		TargetLockManager.cycleFocusedLock(state, 2000);
		// Then — still only one lock, still focused
		expect(state.allLocks).toHaveLength(1);
		expect(state.focusedLockId).toBe(r.lock!.id);
		expect(state.allLocks[0]!.isFocused).toBe(true);
	});

	it("C2 — three locks: Tab cycles forward through all and wraps around", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner({ maxSimultaneousLocks: 3 });
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1", { x: 10, y: 0 }), scanner, [], 1000);
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e2", { x: 20, y: 0 }), scanner, [], 2000);
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e3", { x: 30, y: 0 }), scanner, [], 3000);
		// e1 starts focused (index 0)
		expect(state.allLocks[0]!.isFocused).toBe(true);

		// When — first Tab → e2 (index 1)
		TargetLockManager.cycleFocusedLock(state, 4000);
		expect(state.allLocks[1]!.isFocused).toBe(true);
		expect(state.allLocks[0]!.isFocused).toBe(false);
		expect(state.allLocks[2]!.isFocused).toBe(false);

		// When — second Tab → e3 (index 2)
		TargetLockManager.cycleFocusedLock(state, 5000);
		expect(state.allLocks[2]!.isFocused).toBe(true);

		// When — third Tab → wraps back to e1 (index 0)
		TargetLockManager.cycleFocusedLock(state, 6000);
		expect(state.allLocks[0]!.isFocused).toBe(true);
	});

	it("C3 — no locks: Tab is a no-op (no crash)", () => {
		const state = makeState();
		expect(() => TargetLockManager.cycleFocusedLock(state, 1000)).not.toThrow();
		expect(state.allLocks).toHaveLength(0);
		expect(state.focusedLockId).toBeUndefined();
	});

	it("C4 — lastTabCycleMs is updated on each Tab press", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner();
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1"), scanner, [], 1000);
		expect(state.lastTabCycleMs).toBe(0);
		// When
		TargetLockManager.cycleFocusedLock(state, 9999);
		// Then
		expect(state.lastTabCycleMs).toBe(9999);
	});
});

// ── setFocusedLock (HUD click) ────────────────────────────────────────────────

describe("TargetLockManager.setFocusedLock — HUD click", () => {
	it("S1 — clicking a non-focused lock makes it focused; others lose focus", () => {
		// Given — three locks; e1 focused
		const state = makeState();
		const scanner = makeScanner({ maxSimultaneousLocks: 3 });
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1", { x: 10, y: 0 }), scanner, [], 1000);
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e2", { x: 20, y: 0 }), scanner, [], 2000);
		const r3 = TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e3", { x: 30, y: 0 }), scanner, [], 3000);
		// When — click e3's lock indicator
		const ok = TargetLockManager.setFocusedLock(state, r3.lock!.id, 4000);
		// Then
		expect(ok).toBe(true);
		expect(state.focusedLockId).toBe(r3.lock!.id);
		expect(state.allLocks.find((l) => l.targetId === "e3")!.isFocused).toBe(true);
		expect(state.allLocks.find((l) => l.targetId === "e1")!.isFocused).toBe(false);
		expect(state.allLocks.find((l) => l.targetId === "e2")!.isFocused).toBe(false);
	});

	it("S2 — clicking the already-focused lock is idempotent", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner();
		const r = TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1"), scanner, [], 1000);
		// When
		const ok = TargetLockManager.setFocusedLock(state, r.lock!.id, 2000);
		// Then
		expect(ok).toBe(true);
		expect(state.focusedLockId).toBe(r.lock!.id);
		expect(state.allLocks[0]!.isFocused).toBe(true);
	});

	it("S3 — clicking an unknown lockId returns false and leaves state unchanged", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner();
		const r = TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1"), scanner, [], 1000);
		// When
		const ok = TargetLockManager.setFocusedLock(state, "ghost-lock", 2000);
		// Then
		expect(ok).toBe(false);
		expect(state.focusedLockId).toBe(r.lock!.id);
	});

	it("S4 — lastClickLockMs is updated on a successful focus change", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner({ maxSimultaneousLocks: 2 });
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1", { x: 10, y: 0 }), scanner, [], 1000);
		const r2 = TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e2", { x: 20, y: 0 }), scanner, [], 2000);
		expect(state.lastClickLockMs).toBe(0);
		// When
		TargetLockManager.setFocusedLock(state, r2.lock!.id, 5555);
		// Then
		expect(state.lastClickLockMs).toBe(5555);
	});
});

// ── onTargetDestroyed ─────────────────────────────────────────────────────────

describe("TargetLockManager.onTargetDestroyed", () => {
	it("OD1 — destroying the focused target auto-focuses the next lock", () => {
		// Given — two locks; e1 is focused
		const state = makeState();
		const scanner = makeScanner({ maxSimultaneousLocks: 2 });
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1", { x: 10, y: 0 }), scanner, [], 1000);
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e2", { x: 20, y: 0 }), scanner, [], 2000);
		// When
		TargetLockManager.onTargetDestroyed(state, "e1");
		// Then — e1 lock removed; e2 is now focused
		expect(state.allLocks).toHaveLength(1);
		expect(state.allLocks[0]!.targetId).toBe("e2");
		expect(state.allLocks[0]!.isFocused).toBe(true);
	});

	it("OD2 — destroying a non-focused target leaves focus on the focused lock", () => {
		// Given — two locks; e1 focused, e2 not
		const state = makeState();
		const scanner = makeScanner({ maxSimultaneousLocks: 2 });
		const r1 = TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1", { x: 10, y: 0 }), scanner, [], 1000);
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e2", { x: 20, y: 0 }), scanner, [], 2000);
		// When — e2 destroyed (not focused)
		TargetLockManager.onTargetDestroyed(state, "e2");
		// Then — e1 remains, still focused
		expect(state.allLocks).toHaveLength(1);
		expect(state.allLocks[0]!.targetId).toBe("e1");
		expect(state.focusedLockId).toBe(r1.lock!.id);
	});

	it("OD3 — destroying the only locked target leaves empty state", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner();
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1"), scanner, [], 1000);
		// When
		TargetLockManager.onTargetDestroyed(state, "e1");
		// Then
		expect(state.allLocks).toHaveLength(0);
		expect(state.focusedLockId).toBeUndefined();
	});

	it("OD4 — destroying an id that is not locked is a no-op", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner();
		const r = TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1"), scanner, [], 1000);
		// When
		TargetLockManager.onTargetDestroyed(state, "ghost-enemy");
		// Then — state unchanged
		expect(state.allLocks).toHaveLength(1);
		expect(state.focusedLockId).toBe(r.lock!.id);
	});
});

// ── quickLockNearestHostile ("/" key) ─────────────────────────────────────────

describe("TargetLockManager.quickLockNearestHostile — '/' key", () => {
	it("Q1 — single hostile in range → locked and focused", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner({ range: 500 });
		const enemies = [makeEnemy("e1", { x: 100, y: 0 }, Aggression.HOSTILE)];
		// When
		const result = TargetLockManager.quickLockNearestHostile(
			state, { x: 0, y: 0 }, enemies, scanner, [], 1000,
		);
		// Then
		expect(result.success).toBe(true);
		expect(result.lock!.targetId).toBe("e1");
		expect(result.lock!.isFocused).toBe(true);
		expect(state.allLocks).toHaveLength(1);
		expect(state.focusedLockId).toBe(result.lock!.id);
	});

	it("Q2 — multiple hostiles → nearest (by Euclidean distance) is locked", () => {
		// Given — three hostiles at different distances
		const state = makeState();
		const scanner = makeScanner({ range: 500 });
		const enemies = [
			makeEnemy("e_far", { x: 300, y: 0 }, Aggression.HOSTILE),
			makeEnemy("e_mid", { x: 150, y: 0 }, Aggression.HOSTILE),
			makeEnemy("e_near", { x: 80, y: 0 }, Aggression.HOSTILE),
		];
		// When
		const result = TargetLockManager.quickLockNearestHostile(
			state, { x: 0, y: 0 }, enemies, scanner, [], 1000,
		);
		// Then — e_near wins
		expect(result.success).toBe(true);
		expect(result.lock!.targetId).toBe("e_near");
	});

	it("Q3 — no enemies at all → no-hostile-target", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner();
		// When
		const result = TargetLockManager.quickLockNearestHostile(
			state, { x: 0, y: 0 }, [], scanner, [], 1000,
		);
		// Then
		expect(result.success).toBe(false);
		expect(result.reason).toBe("no-hostile-target");
	});

	it("Q4 — only neutral enemies → no-hostile-target", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner({ range: 500 });
		const enemies = [
			makeEnemy("e1", { x: 50, y: 0 }, Aggression.NEUTRAL),
			makeEnemy("e2", { x: 80, y: 0 }, Aggression.NEUTRAL),
		];
		// When
		const result = TargetLockManager.quickLockNearestHostile(
			state, { x: 0, y: 0 }, enemies, scanner, [], 1000,
		);
		// Then
		expect(result.success).toBe(false);
		expect(result.reason).toBe("no-hostile-target");
	});

	it("Q5 — nearest hostile is occluded; next nearest is chosen", () => {
		// Given — e_near occluded by a planet, e_mid is clear
		const state = makeState();
		const scanner = makeScanner({ range: 500, penetrationLevel: 0 });
		const enemies = [
			makeEnemy("e_near", { x: 100, y: 0 }, Aggression.HOSTILE),
			makeEnemy("e_mid", { x: 0, y: 200 }, Aggression.HOSTILE), // different axis
		];
		// Planet blocks path to e_near (on x-axis)
		const planet = makeBody({ type: "planet", position: { x: 50, y: 0 }, radius: 10 });
		// When
		const result = TargetLockManager.quickLockNearestHostile(
			state, { x: 0, y: 0 }, enemies, scanner, [planet], 1000,
		);
		// Then — e_mid chosen (e_near was blocked)
		expect(result.success).toBe(true);
		expect(result.lock!.targetId).toBe("e_mid");
	});

	it("Q6 — hostile already locked → refocused, no duplicate lock", () => {
		// Given — e1 is already locked but not focused; e2 is focused
		const state = makeState();
		const scanner = makeScanner({ maxSimultaneousLocks: 3, range: 500 });
		const r1 = TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1", { x: 50, y: 0 }), scanner, [], 1000);
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e2", { x: 80, y: 0 }), scanner, [], 2000);
		// Manually set focus to e2
		TargetLockManager.setFocusedLock(state, state.allLocks.find((l) => l.targetId === "e2")!.id, 3000);
		// When — "/" pressed; e1 is nearest hostile
		const enemies = [makeEnemy("e1", { x: 50, y: 0 })];
		const result = TargetLockManager.quickLockNearestHostile(
			state, { x: 0, y: 0 }, enemies, scanner, [], 4000,
		);
		// Then — existing lock refocused, no new lock created
		expect(result.success).toBe(true);
		expect(result.lock!.id).toBe(r1.lock!.id);
		expect(state.allLocks).toHaveLength(2); // no duplicate
		expect(state.focusedLockId).toBe(r1.lock!.id);
	});

	it("Q7 — at max lock limit → oldest lock evicted to make room", () => {
		// Given — scanner allows 2 locks; both slots filled
		const state = makeState();
		const scanner = makeScanner({ maxSimultaneousLocks: 2, range: 500 });
		const r1 = TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e1", { x: 10, y: 0 }), scanner, [], 1000);
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e2", { x: 20, y: 0 }), scanner, [], 2000);
		expect(state.allLocks).toHaveLength(2);
		// When — "/" quick-locks e3
		const enemies = [makeEnemy("e3", { x: 30, y: 0 })];
		const result = TargetLockManager.quickLockNearestHostile(
			state, { x: 0, y: 0 }, enemies, scanner, [], 3000,
		);
		// Then — oldest lock (e1 at t=1000) evicted; e3 is now locked and focused
		expect(result.success).toBe(true);
		expect(result.lock!.targetId).toBe("e3");
		expect(state.allLocks).toHaveLength(2);
		const ids = state.allLocks.map((l) => l.targetId);
		expect(ids).not.toContain("e1"); // oldest evicted
		expect(ids).toContain("e3");
		expect(r1.lock!.id).not.toBe(state.focusedLockId); // evicted lock no longer focused
	});

	it("Q8 — all hostiles out of range → no-hostile-target", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner({ range: 100 });
		const enemies = [
			makeEnemy("e1", { x: 200, y: 0 }, Aggression.HOSTILE),
			makeEnemy("e2", { x: 300, y: 0 }, Aggression.HOSTILE),
		];
		// When
		const result = TargetLockManager.quickLockNearestHostile(
			state, { x: 0, y: 0 }, enemies, scanner, [], 1000,
		);
		// Then
		expect(result.success).toBe(false);
		expect(result.reason).toBe("no-hostile-target");
	});

	it("Q9 — VIGILANT enemies qualify for quick-lock", () => {
		// Given
		const state = makeState();
		const scanner = makeScanner({ range: 500 });
		const enemies = [makeEnemy("e1", { x: 100, y: 0 }, Aggression.VIGILANT)];
		// When
		const result = TargetLockManager.quickLockNearestHostile(
			state, { x: 0, y: 0 }, enemies, scanner, [], 1000,
		);
		// Then — VIGILANT counts as aggro'd
		expect(result.success).toBe(true);
		expect(result.lock!.targetId).toBe("e1");
	});

	it("Q10 — resulting lock is always focused regardless of prior focus state", () => {
		// Given — some existing focused lock on e_existing
		const state = makeState();
		const scanner = makeScanner({ maxSimultaneousLocks: 3, range: 500 });
		TargetLockManager.attemptLock(state, { x: 0, y: 0 }, makeTarget("e_existing", { x: 200, y: 0 }), scanner, [], 1000);
		expect(state.allLocks[0]!.isFocused).toBe(true);
		// When — "/" quick-locks nearest hostile (closer)
		const enemies = [makeEnemy("e_new", { x: 50, y: 0 })];
		const result = TargetLockManager.quickLockNearestHostile(
			state, { x: 0, y: 0 }, enemies, scanner, [], 2000,
		);
		// Then — new lock is focused; old lock is not
		expect(result.success).toBe(true);
		expect(result.lock!.isFocused).toBe(true);
		expect(state.focusedLockId).toBe(result.lock!.id);
		const existingLock = state.allLocks.find((l) => l.targetId === "e_existing")!;
		expect(existingLock.isFocused).toBe(false);
	});
});
