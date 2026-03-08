#!/usr/bin/env node

import WebSocket from "ws";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { createTerminal } from "./terminal";

const PORT = parseInt(process.env.PORT || "3001", 10);

const wss = new WebSocket.Server({
  port: PORT,
  host: "127.0.0.1",
});

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║       NoBlackBox Terminal Bridge                          ║
║                                                           ║
║   Port: ${PORT}                                           ║
║   URL:  ws://localhost:${PORT}                            ║
║                                                           ║
║   Waiting for editor connection...                        ║
║                                                           ║
║   Press Ctrl+C to stop                                    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

wss.on("connection", (ws) => {
  console.log("✓ Editor connected");

  // Optional token for simple auth (local-only). If set, the client must send
  // { type: 'auth', token: '...'} as the first message after connecting.
  const REQUIRED_TOKEN = process.env.TERMINAL_BRIDGE_TOKEN;

  let shell: string;
  if (os.platform() === "win32") {
    shell = "powershell.exe";
  } else {
    const shells = ["/bin/bash", "/bin/zsh", "/usr/bin/bash", "/usr/bin/zsh"];
    shell = (process.env.SHELL && fs.existsSync(process.env.SHELL))
      ? process.env.SHELL
      : shells.find((s) => fs.existsSync(s)) || "/bin/bash";
  }
  console.log(`  Using shell: ${shell}`);

  const cwd = process.env.HOME || process.env.TMPDIR || "/tmp";

  const ptyProcess = createTerminal(shell, [], {
    cols: 80,
    rows: 30,
    cwd,
    env: process.env as { [key: string]: string },
  });

  // Detect whether the terminal backend is a fallback (pipe-based) so we can
  // apply a small echo-suppression heuristic to avoid duplicated characters
  // when shells echo input repeatedly under pipe-based fallbacks.
  const isFallback = Boolean((ptyProcess as any).isFallback);
  let lastWriteTime = 0;
  let suppressionTimer: NodeJS.Timeout | null = null;
  let bufferedData = "";
  const SUPPRESSION_MS = 60;

  function flushBuffered() {
    suppressionTimer = null;
    if (!bufferedData) return;
    // If the buffered data is a short repeated single character (like "hhhhhhh"),
    // drop it — it's very likely an echo artifact. Otherwise forward it.
    const m = bufferedData.match(/^([^\r\n])\1+$/);
    if (m && bufferedData.length <= 16) {
      // drop
      bufferedData = "";
      return;
    }
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "data", data: bufferedData }));
      } catch {}
    }
    bufferedData = "";
  }

  // Send PTY data wrapped in JSON for a clear protocol
  ptyProcess.onData((data: string) => {
    if (isFallback) {
      const now = Date.now();
      // If data arrives shortly after a client write, buffer and suppress
      // obvious repeated-character echoes.
      if (now - lastWriteTime < SUPPRESSION_MS) {
        bufferedData += data;
        if (suppressionTimer) clearTimeout(suppressionTimer);
        suppressionTimer = setTimeout(flushBuffered, SUPPRESSION_MS);
        return;
      }
      // No suppression active — send immediately
    }
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "data", data }));
      } catch (err) {
        // ignore send errors for now
      }
    }
  });

  let authenticated = !REQUIRED_TOKEN; // if no token required, treat as authed

  ws.on("message", (data: WebSocket.Data) => {
    // Expect JSON protocol messages from client
    let msg: any;
    try {
      msg = JSON.parse(data.toString());
    } catch (err) {
      // Legacy/raw fallback: treat as raw input
      if (ptyProcess) ptyProcess.write(data.toString());
      return;
    }

    if (!authenticated) {
      if (msg && msg.type === "auth" && msg.token === REQUIRED_TOKEN) {
        authenticated = true;
        ws.send(JSON.stringify({ type: "auth", ok: true }));
      } else {
        ws.send(JSON.stringify({ type: "error", message: "authentication required" }));
        ws.close();
      }
      return;
    }

    switch (msg.type) {
      case "input":
        if (typeof msg.data === "string") ptyProcess.write(msg.data);
        break;
      case "resize":
        if (typeof msg.cols === "number" && typeof msg.rows === "number") {
          ptyProcess.resize(msg.cols, msg.rows);
        }
        break;
      default:
        // unknown message type
        break;
    }
  });

  ws.on("close", () => {
    console.log("✗ Editor disconnected");
    try {
      ptyProcess.kill();
    } catch {}
  });

  ptyProcess.onExit((code: number | null) => {
    console.log(`⚠ Terminal exited with code ${code}`);
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "exit", code }));
    } catch {}
    try {
      ws.close();
    } catch {}
  });
});

function shutdown(signal: string) {
  console.log(`\n👋 Shutting down bridge... (${signal})`);
  try {
    wss.clients.forEach((c) => c.close());
    wss.close();
  } catch (err) {
    // ignore
  }
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
