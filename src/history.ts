import { HistoryEvent } from './interfaces';

export class HistoryManager {
  private events: HistoryEvent[] = [];
  private limit: number;

  constructor(limit: number = 500) {
    this.limit = limit;
  }

  push(event: HistoryEvent): void {
    this.events.push(event);
    if (this.events.length > this.limit) {
      this.events.shift();
    }
  }

  getAll(): HistoryEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }

  setLimit(limit: number): void {
    this.limit = limit;
    while (this.events.length > this.limit) {
      this.events.shift();
    }
  }

  getLimit(): number {
    return this.limit;
  }

  getLength(): number {
    return this.events.length;
  }
}
