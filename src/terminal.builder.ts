import { ITerminalAdapter, ITerminalAdapterFactory } from './terminal-adapter.interface';
import { TerminalOptions } from './interfaces';
import { NodePtyAdapterFactory } from './node-pty.adapter';
import { FallbackAdapterFactory } from './fallback.adapter';

export class TerminalBuilder {
  private shell: string = '/bin/bash';
  private options: TerminalOptions = { cols: 80, rows: 30 };
  private adapterFactory: ITerminalAdapterFactory | null = null;

  setShell(shell: string): TerminalBuilder {
    this.shell = shell;
    return this;
  }

  setCols(cols: number): TerminalBuilder {
    this.options.cols = cols;
    return this;
  }

  setRows(rows: number): TerminalBuilder {
    this.options.rows = rows;
    return this;
  }

  setCwd(cwd: string): TerminalBuilder {
    this.options.cwd = cwd;
    return this;
  }

  setEnv(env: { [key: string]: string }): TerminalBuilder {
    this.options.env = env;
    return this;
  }

  setArgs(args: string[]): TerminalBuilder {
    this.options.args = args;
    return this;
  }

  usePty(usePty: boolean): TerminalBuilder {
    if (usePty) {
      this.adapterFactory = NodePtyAdapterFactory.getInstance();
    } else {
      this.adapterFactory = FallbackAdapterFactory.getInstance();
    }
    return this;
  }

  private selectAdapterFactory(): ITerminalAdapterFactory {
    if (this.adapterFactory) {
      return this.adapterFactory;
    }

    const ptyFactory = NodePtyAdapterFactory.getInstance();
    if (ptyFactory.supportsTruePty()) {
      return ptyFactory;
    }

    return FallbackAdapterFactory.getInstance();
  }

  build(): ITerminalAdapter {
    const factory = this.selectAdapterFactory();
    
    if (factory === NodePtyAdapterFactory.getInstance()) {
      try {
        return factory.create(this.options, this.shell);
      } catch (error: any) {
        if (error.message?.includes('node-pty spawn failed') || error.message?.includes('node-pty is not available')) {
          return FallbackAdapterFactory.getInstance().create(this.options, this.shell);
        }
        throw error;
      }
    }
    
    return factory.create(this.options, this.shell);
  }
}

export function supportsTruePty(): boolean {
  return NodePtyAdapterFactory.getInstance().supportsTruePty();
}
