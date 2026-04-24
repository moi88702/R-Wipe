import { describe, expect, it } from "vitest";
import { missionToLevelState } from "./MissionManager";
import type { MissionSpec } from "../types/campaign";

function spec(overrides: Partial<MissionSpec> = {}): MissionSpec {
  return {
    id: "m-test",
    nodeId: "n-test",
    name: "Test Mission",
    difficulty: 1,
    levelNumber: 1,
    rewardCredits: 0,
    rewardParts: [],
    rewardBlueprints: [],
    rewardMaterials: {},
    ...overrides,
  };
}

describe("missionToLevelState", () => {
  it("uses the spec's levelNumber and default roster at level 1", () => {
    const level = missionToLevelState(spec({ levelNumber: 1, difficulty: 1 }));
    expect(level.levelNumber).toBe(1);
    expect(level.difficulty.newEnemyTypesUnlocked).toEqual(["grunt"]);
    expect(level.isComplete).toBe(false);
    expect(level.enemiesDefeated).toBe(0);
  });

  it("applies the difficulty bonus multiplier to enemy counts and health", () => {
    const easy = missionToLevelState(spec({ levelNumber: 3, difficulty: 1 }));
    const hard = missionToLevelState(spec({ levelNumber: 3, difficulty: 5 }));
    // Hard (5-star) should spawn more enemies and tougher ones than easy.
    expect(hard.difficulty.enemyCountBase).toBeGreaterThan(easy.difficulty.enemyCountBase);
    expect(hard.difficulty.enemyHealthMultiplier).toBeGreaterThan(
      easy.difficulty.enemyHealthMultiplier,
    );
    // Speed is NOT multiplied by the difficulty bonus; it tracks level only.
    expect(hard.difficulty.enemySpeedMultiplier).toBe(easy.difficulty.enemySpeedMultiplier);
  });

  it("honours an explicit enemyRoster override", () => {
    const level = missionToLevelState(
      spec({ levelNumber: 2, enemyRoster: ["grunt", "stalker"] }),
    );
    expect(level.difficulty.newEnemyTypesUnlocked).toEqual(["grunt", "stalker"]);
  });

  it("falls back to the full roster for level numbers past the progression table", () => {
    const level = missionToLevelState(spec({ levelNumber: 99, difficulty: 3 }));
    expect(level.difficulty.newEnemyTypesUnlocked.length).toBeGreaterThan(5);
    expect(level.difficulty.newEnemyTypesUnlocked).toContain("cannoneer");
  });

  it("caps targetDurationMs at 10 minutes", () => {
    const long = missionToLevelState(spec({ levelNumber: 99 }));
    expect(long.targetDurationMs).toBe(600_000);
  });
});
