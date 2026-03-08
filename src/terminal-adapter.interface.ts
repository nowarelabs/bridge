import { SpawnOptions } from './interfaces';

export interface ITerminalAdapter {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(cb: (data: string) => void): void;
  onExit(cb: (code: number | null) => void): void;
  isFallback(): boolean;
}

export interface ITerminalAdapterFactory {
  create(options: SpawnOptions, shell: string): ITerminalAdapter;
  supportsTruePty(): boolean;
}
