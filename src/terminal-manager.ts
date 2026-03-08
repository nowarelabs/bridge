import WebSocket from 'ws';
import * as crypto from 'crypto';
import { TerminalEntry } from './terminal-entry';
import { TerminalBuilder } from './terminal.builder';
import { ConfigManager } from './config';
import { TerminalInfo, HistoryEvent, CreateResponse, ClientMessage, ServerMessage } from './interfaces';

export class TerminalManager {
  private terminals: Map<number, TerminalEntry> = new Map();
  private tokenMap: Map<string, number> = new Map();
  private ownedIds: Set<number> = new Set();
  private nextId: number = 1;
  private owner: WebSocket;
  private config: ConfigManager;
  private shell: string;
  private cwd: string;
  private onTerminalClosed?: (id: number) => void;
  private writeTimestamps: Map<number, number> = new Map();
  private SUPPRESSION_MS = 60;

  constructor(
    owner: WebSocket,
    config: ConfigManager,
    shell: string,
    cwd: string
  ) {
    this.owner = owner;
    this.config = config;
    this.shell = shell;
    this.cwd = cwd;
  }

  setOnTerminalClosed(callback: (id: number) => void): void {
    this.onTerminalClosed = callback;
  }

  private generateToken(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  create(msg: ClientMessage): CreateResponse {
    if (this.ownedIds.size >= this.config.getMaxTerminals()) {
      return { error: 'max-terminals-reached' };
    }

    const id = this.nextId++;
    const token = this.generateToken();
    const cols = typeof msg.cols === 'number' ? msg.cols : 80;
    const rows = typeof msg.rows === 'number' ? msg.rows : 30;
    const shellPath = typeof msg.shell === 'string' ? msg.shell : this.shell;
    const cwdPath = typeof msg.cwd === 'string' ? msg.cwd : this.cwd;

    const proc = new TerminalBuilder()
      .setShell(shellPath)
      .setCols(cols)
      .setRows(rows)
      .setCwd(cwdPath)
      .setEnv(process.env as { [key: string]: string })
      .build();

    const terminal = new TerminalEntry(
      id,
      token,
      this.owner,
      proc,
      shellPath,
      cols,
      rows,
      cwdPath,
      this.config.getIdleTimeoutMs(),
      this.config.getHistoryLimitEvents()
    );

    this.terminals.set(id, terminal);
    this.tokenMap.set(token, id);
    this.ownedIds.add(id);

    terminal.history.push({
      t: Date.now(),
      type: 'create',
      shell: shellPath,
      cols,
      rows,
      cwd: cwdPath,
      token,
    });

    this.setupTerminalEvents(terminal);
    terminal.resetIdle();

    console.log(`Terminal ${id} created for connection (token=${token})`);
    return { id, token };
  }

  private setupTerminalEvents(terminal: TerminalEntry): void {
    terminal.proc.onData((data: string) => {
      const lastWrite = this.writeTimestamps.get(terminal.id) || 0;
      if (terminal.isFallback() && (Date.now() - lastWrite) < this.SUPPRESSION_MS) {
        const match = data.match(/^([^\r\n])\1+$/);
        if (match && data.length <= 16) return;
      }

      terminal.history.push({
        t: Date.now(),
        type: 'out',
        data,
      });
      terminal.resetIdle();
      terminal.sendToOwner({ type: 'data', id: terminal.id, data });
    });

    terminal.proc.onExit((code) => {
      terminal.history.push({
        t: Date.now(),
        type: 'exit',
        code: code ?? undefined,
      });
      terminal.sendToOwner({ type: 'exit', id: terminal.id, code: code ?? undefined });
      terminal.sendToOwner({ type: 'closed', id: terminal.id });
      this.remove(terminal.id);
    });
  }

  input(id: number, data: string): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal || terminal.closed || !terminal.isOwner(this.owner)) {
      return false;
    }
    terminal.write(data);
    this.writeTimestamps.set(id, Date.now());
    return true;
  }

  resize(id: number, cols: number, rows: number): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal || terminal.closed || !terminal.isOwner(this.owner)) {
      return false;
    }
    terminal.resize(cols, rows);
    return true;
  }

  close(id: number): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal || !terminal.isOwner(this.owner)) {
      return false;
    }
    this.remove(id);
    return true;
  }

  list(): TerminalInfo[] {
    return Array.from(this.terminals.values()).map((t) => t.getInfo());
  }

  history(id: number): HistoryEvent[] | null {
    const terminal = this.terminals.get(id);
    if (!terminal || !terminal.isOwner(this.owner)) {
      return null;
    }
    return terminal.getHistory();
  }

  getById(id: number): TerminalEntry | undefined {
    return this.terminals.get(id);
  }

  ensureOwner(id: number): { ok: boolean; terminal?: TerminalEntry; error?: string } {
    const terminal = this.terminals.get(id);
    if (!terminal) return { ok: false, error: 'not-found' };
    if (!terminal.isOwner(this.owner)) return { ok: false, error: 'not-owner' };
    return { ok: true, terminal };
  }

  closeAll(): void {
    this.terminals.forEach((terminal) => {
      terminal.close();
      terminal.sendToOwner({ type: 'closed', id: terminal.id });
    });
    this.terminals.clear();
    this.tokenMap.clear();
    this.ownedIds.clear();
  }

  closeAllAfterGrace(): void {
    this.terminals.forEach((terminal) => {
      terminal.idleTimer.stop();
      terminal.idleTimer.setOnTimeout(() => {
        terminal.close();
        terminal.sendToOwner({ type: 'closed', id: terminal.id });
        this.remove(terminal.id);
      });
      terminal.idleTimer.reset();
    });
  }

  private remove(id: number): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      this.terminals.delete(id);
      this.tokenMap.delete(terminal.token);
      this.ownedIds.delete(id);
      this.onTerminalClosed?.(id);
      console.log(`Terminal ${id} closed`);
    }
  }

  getOwnedCount(): number {
    return this.ownedIds.size;
  }
}
