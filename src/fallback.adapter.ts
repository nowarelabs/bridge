import { spawn as spawnChild, ChildProcessWithoutNullStreams } from 'child_process';
import { ITerminalAdapter } from './terminal-adapter.interface';
import { SpawnOptions } from './interfaces';

export class FallbackAdapter implements ITerminalAdapter {
  private child: ChildProcessWithoutNullStreams;
  private dataCb: ((data: string) => void) | null = null;

  constructor(child: ChildProcessWithoutNullStreams) {
    this.child = child;

    this.child.stdout.on('data', (chunk: Buffer | string) => {
      if (this.dataCb) this.dataCb(chunk.toString());
    });

    this.child.stderr.on('data', (chunk: Buffer | string) => {
      if (this.dataCb) this.dataCb(chunk.toString());
    });
  }

  write(data: string): void {
    try {
      this.child.stdin.write(data);
    } catch {}
  }

  resize(_cols: number, _rows: number): void {}

  kill(): void {
    try {
      this.child.kill();
    } catch {}
  }

  onData(cb: (data: string) => void): void {
    this.dataCb = cb;
  }

  onExit(cb: (code: number | null) => void): void {
    this.child.on('exit', (code: number | null) => cb(code));
  }

  isFallback(): boolean {
    return true;
  }
}

export class FallbackAdapterFactory {
  private static instance: FallbackAdapterFactory | null = null;

  static getInstance(): FallbackAdapterFactory {
    if (!FallbackAdapterFactory.instance) {
      FallbackAdapterFactory.instance = new FallbackAdapterFactory();
    }
    return FallbackAdapterFactory.instance;
  }

  create(options: SpawnOptions, shell: string): ITerminalAdapter {
    const args = [...(options.args || [])];

    if (!args.length && /(?:bash|zsh)$/i.test(shell) && process.platform !== 'win32') {
      args.push('-i');
    }

    const child = spawnChild(shell, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    console.log('[terminal] backend=fallback-child_process', { shell, args });
    return new FallbackAdapter(child);
  }

  supportsTruePty(): boolean {
    return false;
  }
}
