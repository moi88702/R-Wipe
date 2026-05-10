/** State for the crew roster screen. Logic lives in GameManager. */
export class SolarCrewHandler {
  selection = 0;
  scrollOffset = 0;
  /** Non-null when the player has opened a bot's detail card. */
  detailBotId: string | null = null;

  reset(): void {
    this.selection = 0;
    this.scrollOffset = 0;
    this.detailBotId = null;
  }
}
