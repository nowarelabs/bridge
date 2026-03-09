import { ITerminalAdapter, ITerminalAdapterFactory } from './terminal-adapter.interface';
import { SpawnOptions } from './interfaces';

let nodePtyModule: any = null;

function loadNodePty(): boolean {
  if (nodePtyModule !== null) return nodePtyModule !== false;
  try {
    nodePtyModule = require('node-pty');
    return true;
  } catch {
    nodePtyModule = false;
    return false;
  }
}

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

export class NodePtyAdapterFactory implements ITerminalAdapterFactory {
  private static instance: NodePtyAdapterFactory | null = null;

  private constructor() {}

  static getInstance(): NodePtyAdapterFactory {
    if (!NodePtyAdapterFactory.instance) {
      NodePtyAdapterFactory.instance = new NodePtyAdapterFactory();
    }
    return NodePtyAdapterFactory.instance;
  }

  create(options: SpawnOptions, shell: string): ITerminalAdapter {
    if (!loadNodePty()) {
      throw new Error('node-pty is not available');
    }

    const cols = options.cols || 80;
    const rows = options.rows || 30;
    const args = options.args || [];

    try {
      const ptyProcess = nodePtyModule.spawn(shell, args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: options.cwd,
        env: options.env || process.env,
      });

      return new NodePtyAdapter(ptyProcess);
    } catch (spawnError: any) {
      throw new Error(`node-pty spawn failed: ${spawnError.message}`);
    }
  }

  supportsTruePty(): boolean {
    return loadNodePty();
  }
}
