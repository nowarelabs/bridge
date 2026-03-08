import { spawn as spawnChild } from "child_process";
import * as os from "os";

export type TerminalProcess = {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
  onData: (cb: (d: string) => void) => void;
  onExit: (cb: (code: number | null) => void) => void;
  // true when this process is the pipe-based fallback (no real PTY)
  isFallback?: boolean;
};

export type SpawnOptions = {
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: { [k: string]: string };
};

// Tries to use node-pty when available. If it fails (missing prebuilds, exec
// errors, etc.) falls back to a plain child_process.spawn implementation.
// The fallback does NOT provide a true PTY (so some interactive programs may
// behave differently), but it's a robust option when node-pty can't run.
export function createTerminal(shell: string, args: string[] = [], opts: SpawnOptions = {}): TerminalProcess {
  const cols = opts.cols || 80;
  const rows = opts.rows || 30;

  // Try node-pty dynamically so requiring the package doesn't throw at import time
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodePty = require("node-pty");
    const ptyProcess = nodePty.spawn(shell, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: opts.cwd,
      env: opts.env || process.env,
    });

    console.log("[terminal] backend=node-pty");

    return {
      write: (data: string) => ptyProcess.write(data),
      resize: (c: number, r: number) => ptyProcess.resize(c, r),
      kill: () => { try { ptyProcess.kill(); } catch {} },
      onData: (cb: (d: string) => void) => ptyProcess.onData(cb),
      onExit: (cb: (code: number | null) => void) => ptyProcess.onExit(({ exitCode }: any) => cb(exitCode)),
      isFallback: false,
    };
  } catch (err) {
    // Fallback: use child_process.spawn with stdio pipes. This is not a real
    // PTY: programs that require a tty may not work correctly. However, many
    // shells and commands still behave well enough for simple use.
    // If we're falling back to pipes and the requested shell is bash/zsh,
    // add '-i' so the shell runs in interactive mode and responds to stdin.
    const fallbackArgs = [...args];
    if (!fallbackArgs.length && /(?:bash|zsh)$/i.test(shell) && process.platform !== 'win32') {
      fallbackArgs.push('-i');
    }

    const child = spawnChild(shell, fallbackArgs, {
      cwd: opts.cwd,
      env: opts.env || process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    console.log("[terminal] backend=fallback-child_process", { shell, args: fallbackArgs });

    let dataCb: ((d: string) => void) | null = null;
    child.stdout.on("data", (chunk: Buffer | string) => {
      if (dataCb) dataCb(chunk.toString());
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      if (dataCb) dataCb(chunk.toString());
    });

    return {
      write: (data: string) => {
        try {
          child.stdin.write(data);
        } catch {}
      },
      resize: (_c: number, _r: number) => {
        // No-op: cannot resize a pipe-based child. Some callers expect this to exist.
      },
      kill: () => {
        try { child.kill(); } catch {}
      },
      onData: (cb: (d: string) => void) => { dataCb = cb; },
      onExit: (cb: (code: number | null) => void) => child.on("exit", (code: number | null) => cb(code)),
      isFallback: true,
    };
  }
}

export function supportsTruePty(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require.resolve("node-pty");
    return true;
  } catch (err) {
    return false;
  }
}
