import WebSocket from 'ws';
import * as os from 'os';
import * as fs from 'fs';
import { TerminalManager } from './terminal-manager';
import { ConfigManager, DEFAULT_CONFIG } from './config';
import { MessageProtocol } from './message-protocol';
import { ClientMessage } from './interfaces';

export class ConnectionHandler {
  private ws: WebSocket;
  private config: ConfigManager;
  private manager: TerminalManager;
  private protocol: MessageProtocol;
  private authenticated: boolean = false;
  private requiredToken: string | null;
  private shell: string;
  private cwd: string;

  constructor(ws: WebSocket, requiredToken: string | null) {
    this.ws = ws;
    this.requiredToken = requiredToken;
    this.authenticated = !requiredToken;
    this.shell = this.detectShell();
    this.cwd = process.env.HOME || process.env.TMPDIR || '/tmp';
    this.config = new ConfigManager(DEFAULT_CONFIG);
    this.manager = new TerminalManager(ws, this.config, this.shell, this.cwd);
    this.protocol = new MessageProtocol(ws, this.manager, this.config);

    this.setupHandlers();
  }

  private detectShell(): string {
    if (os.platform() === 'win32') {
      return 'powershell.exe';
    }
    const shells = ['/bin/bash', '/bin/zsh', '/usr/bin/bash', '/usr/bin/zsh'];
    return process.env.SHELL && fs.existsSync(process.env.SHELL)
      ? process.env.SHELL
      : shells.find((s) => fs.existsSync(s)) || '/bin/bash';
  }

  private setupHandlers(): void {
    this.ws.on('message', (data: WebSocket.Data) => {
      if (!this.authenticated) {
        this.handleAuth(data);
        return;
      }
      this.protocol.handle(data);
    });

    this.ws.on('close', () => {
      this.handleDisconnect();
    });
  }

  private handleAuth(data: WebSocket.Data): void {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === 'auth' && msg.token === this.requiredToken) {
      this.authenticated = true;
      this.send({ type: 'auth', ok: true });
    } else {
      this.send({ type: 'error', message: 'authentication required' });
      this.ws.close();
    }
  }

  private handleDisconnect(): void {
    if (this.config.getOwnerGraceMs() <= 0) {
      this.manager.closeAll();
    } else {
      this.manager.closeAllAfterGrace();
    }
  }

  private send(msg: object): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch {}
    }
  }

  getShell(): string {
    return this.shell;
  }

  getCwd(): string {
    return this.cwd;
  }
}
