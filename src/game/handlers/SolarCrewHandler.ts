/** State for the crew roster screen. Logic lives in GameManager. */
export class SolarCrewHandler {
  selection = 0;
  scrollOffset = 0;

  reset(): void {
    this.selection = 0;
    this.scrollOffset = 0;
  }
}
