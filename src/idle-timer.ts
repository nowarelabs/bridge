export class IdleTimer {
  private timer: NodeJS.Timeout | null = null;
  private timeoutMs: number;
  private onTimeout: (() => void) | null = null;

  constructor(timeoutMs: number = 15 * 60 * 1000) {
    this.timeoutMs = timeoutMs;
  }

  setOnTimeout(callback: () => void): void {
    this.onTimeout = callback;
  }

  reset(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    if (this.onTimeout && this.timeoutMs > 0) {
      this.timer = setTimeout(() => {
        this.onTimeout?.();
      }, this.timeoutMs);
    }
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  setTimeout(timeoutMs: number): void {
    this.timeoutMs = timeoutMs;
  }

  getTimeout(): number {
    return this.timeoutMs;
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}
