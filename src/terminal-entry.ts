import WebSocket from 'ws';
import { ITerminalAdapter } from './terminal-adapter.interface';
import { HistoryManager } from './history';
import { IdleTimer } from './idle-timer';
import { TerminalInfo, HistoryEvent } from './interfaces';

export class TerminalEntry {
  readonly id: number;
  readonly token: string;
  readonly createdAt: number;
  lastActive: number;
  closed: boolean = false;
  readonly owner: WebSocket;
  readonly proc: ITerminalAdapter;
  readonly history: HistoryManager;
  readonly idleTimer: IdleTimer;
  private shell: string;
  private cols: number;
  private rows: number;
  private cwd: string;

  constructor(
    id: number,
    token: string,
    owner: WebSocket,
    proc: ITerminalAdapter,
    shell: string,
    cols: number,
    rows: number,
    cwd: string,
    idleTimeoutMs: number,
    historyLimitEvents: number
  ) {
    this.id = id;
    this.token = token;
    this.owner = owner;
    this.proc = proc;
    this.shell = shell;
    this.cols = cols;
    this.rows = rows;
    this.cwd = cwd;
    this.createdAt = Date.now();
    this.lastActive = this.createdAt;
    this.history = new HistoryManager(historyLimitEvents);
    this.idleTimer = new IdleTimer(idleTimeoutMs);

    this.setupIdleTimeout();
  }

  private setupIdleTimeout(): void {
    this.idleTimer.setOnTimeout(() => {
      this.close();
    });
  }

  resetIdle(): void {
    this.lastActive = Date.now();
    this.idleTimer.reset();
  }

  write(data: string): void {
    this.proc.write(data);
    this.history.push({
      t: Date.now(),
      type: 'in',
      data,
    });
    this.resetIdle();
  }

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    this.proc.resize(cols, rows);
    this.history.push({
      t: Date.now(),
      type: 'resize',
      cols,
      rows,
    });
    this.resetIdle();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.idleTimer.stop();
    this.proc.kill();
    this.history.push({
      t: Date.now(),
      type: 'close',
    });
  }

  isOwner(ws: WebSocket): boolean {
    return this.owner === ws;
  }

  sendToOwner(message: object): void {
    if (this.owner && this.owner.readyState === WebSocket.OPEN) {
      try {
        this.owner.send(JSON.stringify(message));
      } catch {}
    }
  }

  getInfo(): TerminalInfo {
    return {
      id: this.id,
      createdAt: this.createdAt,
      lastActive: this.lastActive,
      closed: this.closed,
    };
  }

  getHistory(): HistoryEvent[] {
    return this.history.getAll();
  }

  getShell(): string {
    return this.shell;
  }

  getCwd(): string {
    return this.cwd;
  }

  getCols(): number {
    return this.cols;
  }

  getRows(): number {
    return this.rows;
  }

  isFallback(): boolean {
    return this.proc.isFallback();
  }
}
