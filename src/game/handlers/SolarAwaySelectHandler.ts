import type { ScreenType } from "../../types";

/** State for the away-team selection screen. Logic lives in GameManager. */
export class SolarAwaySelectHandler {
  panel: "crew" | "squads" | "confirm" = "crew";
  crewSel = 0;
  squadSel = 0;
  /** Current working selection of bot IDs (up to MAX_AWAY_TEAM). */
  selectedBotIds: Set<string> = new Set();
  /** Screen to return to on ESC or Confirm. */
  fromScreen: ScreenType = "solar-system";

  reset(): void {
    this.panel = "crew";
    this.crewSel = 0;
    this.squadSel = 0;
    this.selectedBotIds = new Set();
    this.fromScreen = "solar-system";
  }
}
