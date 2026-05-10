/** State for the solar-shop screen. Logic lives in GameManager. */
export class SolarShopHandler {
  menuSelection = 0;
  scrollOffset = 0;
  searchText = "";
  statusMsg: string | null = null;
  statusMs = 0;

  reset(): void {
    this.menuSelection = 0;
    this.scrollOffset = 0;
    this.searchText = "";
    this.statusMsg = null;
    this.statusMs = 0;
  }
}
