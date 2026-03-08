import WebSocket from 'ws';
import { TerminalManager } from './terminal-manager';
import { ConfigManager } from './config';
import { ClientMessage, ServerMessage } from './interfaces';

export class MessageProtocol {
  private manager: TerminalManager;
  private config: ConfigManager;
  private owner: WebSocket;
  private configured: boolean = false;

  constructor(owner: WebSocket, manager: TerminalManager, config: ConfigManager) {
    this.owner = owner;
    this.manager = manager;
    this.config = config;
  }

  handle(data: WebSocket.Data): void {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === 'config' && !this.configured) {
      this.handleConfig(msg);
      return;
    }

    switch (msg.type) {
      case 'create':
        this.handleCreate(msg);
        break;
      case 'list':
        this.handleList();
        break;
      case 'input':
        this.handleInput(msg);
        break;
      case 'resize':
        this.handleResize(msg);
        break;
      case 'close':
        this.handleClose(msg);
        break;
      case 'history':
        this.handleHistory(msg);
        break;
      default:
        this.send({ type: 'error', message: 'unknown-message' });
    }
  }

  private handleConfig(msg: ClientMessage): void {
    this.config.update({
      maxTerminals: msg.maxTerminals,
      idleTimeoutMs: msg.idleTimeoutMs,
      ownerGraceMs: msg.ownerGraceMs,
      historyLimitEvents: msg.historyLimitEvents,
    });
    this.configured = true;
    this.send({ type: 'config', ok: true, options: this.config.getConfig() });
  }

  private handleCreate(msg: ClientMessage): void {
    const result = this.manager.create(msg);
    if ('error' in result) {
      this.send({ type: 'error', message: result.error });
    } else {
      this.send({
        type: 'created',
        id: result.id,
        cols: msg.cols || 80,
        rows: msg.rows || 30,
      });
    }
  }

  private handleList(): void {
    const terminals = this.manager.list();
    this.send({ type: 'list', terminals });
  }

  private handleInput(msg: ClientMessage): void {
    const id = Number(msg.id);
    const data = msg.data;
    if (!Number.isInteger(id) || typeof data !== 'string') {
      this.send({ type: 'error', message: 'invalid' });
      return;
    }
    const ownership = this.manager.ensureOwner(id);
    if (!ownership.ok) {
      this.send({ type: 'error', message: ownership.error });
      return;
    }
    this.manager.input(id, data);
  }

  private handleResize(msg: ClientMessage): void {
    const id = Number(msg.id);
    const cols = Number(msg.cols);
    const rows = Number(msg.rows);
    if (!Number.isInteger(id) || !Number.isInteger(cols) || !Number.isInteger(rows)) {
      this.send({ type: 'error', message: 'invalid' });
      return;
    }
    const ownership = this.manager.ensureOwner(id);
    if (!ownership.ok) {
      this.send({ type: 'error', message: ownership.error });
      return;
    }
    this.manager.resize(id, cols, rows);
  }

  private handleClose(msg: ClientMessage): void {
    const id = Number(msg.id);
    if (!Number.isInteger(id)) {
      this.send({ type: 'error', message: 'invalid' });
      return;
    }
    const ownership = this.manager.ensureOwner(id);
    if (!ownership.ok) {
      this.send({ type: 'error', message: ownership.error });
      return;
    }
    this.manager.close(id);
  }

  private handleHistory(msg: ClientMessage): void {
    const id = Number(msg.id);
    if (!Number.isInteger(id)) {
      this.send({ type: 'error', message: 'invalid' });
      return;
    }
    const ownership = this.manager.ensureOwner(id);
    if (!ownership.ok) {
      this.send({ type: 'error', message: ownership.error });
      return;
    }
    const events = this.manager.history(id);
    if (events) {
      this.send({ type: 'history', id, events });
    }
  }

  private send(msg: ServerMessage): void {
    if (this.owner.readyState === WebSocket.OPEN) {
      try {
        this.owner.send(JSON.stringify(msg));
      } catch {}
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  setConfigured(configured: boolean): void {
    this.configured = configured;
  }
}
