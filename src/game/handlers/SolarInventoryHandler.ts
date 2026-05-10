import type { ScreenType } from "../../types";

/** State for the solar-inventory screen. Logic lives in GameManager. */
export class SolarInventoryHandler {
  panel: "station" | "ship" = "ship";
  stationSel = 0;
  shipSel = 0;
  ctxOpen = false;
  ctxSel = 0;
  fromScreen: ScreenType = "solar-system";
  stationScroll = 0;
  shipScroll = 0;

  reset(): void {
    this.panel = "ship";
    this.stationSel = 0;
    this.shipSel = 0;
    this.ctxOpen = false;
    this.ctxSel = 0;
    this.stationScroll = 0;
    this.shipScroll = 0;
  }
}
