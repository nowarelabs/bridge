#!/usr/bin/env node

import WebSocket from 'ws';
import * as net from 'net';
import * as http from 'http';
import os from 'os';
import { ConnectionHandler } from './connection-handler';

const START_PORT = parseInt(process.env.PORT || '3001', 10);
const MAX_PORT_ATTEMPTS = 10;

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  dim: '\x1b[2m',
};

interface TerminalInfo {
  id: string;
  shell: string;
  createdAt: number;
}

let connections = 0;
let terminals: TerminalInfo[] = [];
let port = START_PORT;
let httpPort = START_PORT + 10000;
let lastLineCount = 0;
let rendered = false;

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function pad(str: string, len: number): string {
  return str + ' '.repeat(Math.max(0, len - stripAnsi(str).length));
}

function render() {
  const lines: string[] = [];
  
  const tl = '┌', tr = '┐', bl = '└', br = '┘';
  const ml = '├', mr = '┤', v = '│', h = '─';
  
  const wsUrl = `ws://localhost:${port}`;
  const infoUrl = `http://localhost:${httpPort}/bridge-info`;
  
  const leftWidth = 14;
  const rightWidth = Math.max(
    wsUrl.length,
    infoUrl.length,
    'Waiting for connection...'.length,
    'Connected (1 client)'.length
  ) + 2;
  const innerWidth = leftWidth + rightWidth + 1;
  
  const title = ' NoBlackBox Terminal Bridge ';
  const titleLen = Math.max(title.length, innerWidth);
  
  const dataLines: [string, string][] = [
    ['WebSocket', port.toString()],
    ['HTTP Info', httpPort.toString()],
    ['URL', wsUrl],
    ['Discovery', infoUrl],
  ];
  
  const status = connections > 0
    ? c.green + '●' + c.reset + ' Connected (' + connections + ' client' + (connections !== 1 ? 's' : '') + ')'
    : c.yellow + '○' + c.reset + ' Waiting for connection...';
  
  lines.push(c.cyan + tl + h.repeat(titleLen + 2) + tr + c.reset);
  lines.push(c.cyan + v + c.reset + c.bold + c.cyan + pad(title, titleLen + 2) + c.reset + c.cyan + v + c.reset);
  lines.push(c.cyan + ml + h.repeat(titleLen + 2) + mr + c.reset);
  
  for (const [label, value] of dataLines) {
    const left = '  ' + c.gray + label + c.reset + ':';
    const right = label === 'URL' ? c.green + value + c.reset : value;
    const line = pad(left, leftWidth + 3) + pad(right, rightWidth);
    lines.push(c.cyan + v + c.reset + line + c.cyan + v + c.reset);
  }
  
  lines.push(c.cyan + ml + h.repeat(titleLen + 2) + mr + c.reset);
  lines.push(c.cyan + v + c.reset + pad('  ' + status, titleLen + 2) + c.cyan + v + c.reset);
  
  if (terminals.length > 0) {
    lines.push(c.cyan + ml + h.repeat(titleLen + 2) + mr + c.reset);
    lines.push(c.cyan + v + c.reset + pad('  Terminals: ' + terminals.length, titleLen + 2) + c.cyan + v + c.reset);
    for (const t of terminals.slice(0, 3)) {
      const line = '    ' + t.id.slice(0, 8) + '  ' + t.shell;
      lines.push(c.cyan + v + c.reset + pad(line, titleLen + 2) + c.cyan + v + c.reset);
    }
    if (terminals.length > 3) {
      lines.push(c.cyan + v + c.reset + pad('    ... +' + (terminals.length - 3) + ' more', titleLen + 2) + c.cyan + v + c.reset);
    }
  }
  
  lines.push(c.cyan + bl + h.repeat(titleLen + 2) + br + c.reset);
  lines.push(c.dim + '  Press Ctrl+C to stop' + c.reset);
  
  // Use cursor positioning to update in place
  if (rendered && lastLineCount > 0) {
    process.stdout.write('\x1b[' + lastLineCount + 'A\r');
  }
  
  process.stdout.write(lines.join('\n') + '\n');
  
  if (!rendered) {
    rendered = true;
  }
  lastLineCount = lines.length;
}

function getHostIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return '127.0.0.1';
}

async function findAvailablePort(startPort: number): Promise<number> {
  for (let p = startPort; p < startPort + MAX_PORT_ATTEMPTS; p++) {
    const available = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(p, '127.0.0.1');
    });
    if (available) return p;
  }
  throw new Error('No available port');
}

async function startServer(WSport: number): Promise<void> {
  port = WSport;
  httpPort = WSport + 10000;
  
  const wss = new WebSocket.Server({ port, host: '127.0.0.1' });
  getHostIp();

  const httpServer = http.createServer((req, res) => {
    if (req.url === '/bridge-info') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ wsUrl: `ws://localhost:${port}`, port, terminals: terminals.length }));
    } else if (req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ connections, terminals: terminals.map(t => ({ id: t.id, shell: t.shell })) }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  httpServer.listen(httpPort, '127.0.0.1');

  const handlers = {
    registerTerminal: (info: TerminalInfo) => {
      terminals.push(info);
      render();
    },
    unregisterTerminal: (id: string) => {
      terminals = terminals.filter(t => t.id !== id);
      render();
    }
  };
  
  (globalThis as any).__registerTerminal = handlers.registerTerminal;
  (globalThis as any).__unregisterTerminal = handlers.unregisterTerminal;

  render();

  wss.on('connection', (ws) => {
    connections++;
    render();
    
    new ConnectionHandler(ws, null);
    
    ws.on('close', () => {
      connections--;
      render();
    });
  });

  const shutdown = (sig: string) => {
    console.log(c.gray + '\n  Shutting down... ' + sig + c.reset);
    try { httpServer.close(); wss.clients.forEach((c) => c.close()); wss.close(); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

async function main() {
  port = await findAvailablePort(START_PORT);
  if (port !== START_PORT) {
    console.log(c.yellow + '  Port ' + START_PORT + ' in use, using ' + port + c.reset);
  }
  await startServer(port);
}

main().catch((e) => {
  console.error(c.red + '  Error: ' + c.reset + e.message);
  process.exit(1);
});
