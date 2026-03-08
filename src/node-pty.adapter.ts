import { ITerminalAdapter } from './terminal-adapter.interface';
import { SpawnOptions } from './interfaces';

export class NodePtyAdapter implements ITerminalAdapter {
  private ptyProcess: any;

  constructor(ptyProcess: any) {
    this.ptyProcess = ptyProcess;
  }

  write(data: string): void {
    this.ptyProcess.write(data);
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess.resize(cols, rows);
  }

  kill(): void {
    try {
      this.ptyProcess.kill();
    } catch {}
  }

  onData(cb: (data: string) => void): void {
    this.ptyProcess.onData(cb);
  }

  onExit(cb: (code: number | null) => void): void {
    this.ptyProcess.onExit(({ exitCode }: { exitCode: number }) => cb(exitCode));
  }

  isFallback(): boolean {
    return false;
  }
}

export class NodePtyAdapterFactory {
  private static instance: NodePtyAdapterFactory | null = null;
  private nodePty: any = null;

  private constructor() {
    try {
      this.nodePty = require('node-pty');
    } catch {
      this.nodePty = null;
    }
  }

  static getInstance(): NodePtyAdapterFactory {
    if (!NodePtyAdapterFactory.instance) {
      NodePtyAdapterFactory.instance = new NodePtyAdapterFactory();
    }
    return NodePtyAdapterFactory.instance;
  }

  create(options: SpawnOptions, shell: string): ITerminalAdapter {
    if (!this.nodePty) {
      throw new Error('node-pty is not available');
    }

    const cols = options.cols || 80;
    const rows = options.rows || 30;
    const args = options.args || [];

    const ptyProcess = this.nodePty.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: options.cwd,
      env: options.env || process.env,
    });

    console.log('[terminal] backend=node-pty');
    return new NodePtyAdapter(ptyProcess);
  }

  supportsTruePty(): boolean {
    return this.nodePty !== null;
  }
}
