export class BackgroundNotice {
  private pending = false;
  constructor(private acknowledged = false) {}
  async request(
    show: () => Promise<unknown>,
    hide: () => void,
    quitting: () => boolean,
    persist: () => void,
  ) {
    if (this.pending || quitting()) return;
    if (this.acknowledged) {
      hide();
      return;
    }
    this.pending = true;
    try {
      await show();
      if (quitting()) return;
      this.acknowledged = true;
      try {
        persist();
      } catch {}
      hide();
    } catch {
      if (!quitting()) hide();
    } finally {
      this.pending = false;
    }
  }
}
