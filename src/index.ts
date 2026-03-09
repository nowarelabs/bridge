#!/usr/bin/env node

import WebSocket from 'ws';
import * as net from 'net';
import * as http from 'http';
import os from 'os';
import { ConnectionHandler } from './connection-handler';

const START_PORT = parseInt(process.env.PORT || '3001', 10);
const MAX_PORT_ATTEMPTS = 10;
const REQUIRED_TOKEN = process.env.TERMINAL_BRIDGE_TOKEN || null;

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
  for (let port = startPort; port < startPort + MAX_PORT_ATTEMPTS; port++) {
    const available = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port, '127.0.0.1');
    });
    if (available) return port;
  }
  throw new Error(`No available port found between ${startPort} and ${startPort + MAX_PORT_ATTEMPTS - 1}`);
}

async function startServer(port: number): Promise<void> {
  const wss = new WebSocket.Server({
    port,
    host: '127.0.0.1',
  });

  const hostIp = getHostIp();

  const httpServer = http.createServer((req, res) => {
    if (req.url === '/bridge-info') {
      res.writeHead(200, { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' 
      });
      res.end(JSON.stringify({
        wsUrl: `ws://bridge.localhost:${port}`,
        wsUrlAlt: `ws://localhost:${port}`,
        wsUrlIp: `ws://${hostIp}:${port}`,
        port,
      }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  httpServer.listen(port + 10000, '127.0.0.1');

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║       NoBlackBox Terminal Bridge                          ║
║                                                           ║
║   WebSocket:  ${port}                                       ║
║   HTTP Info:  ${port + 10000}                                       ║
║                                                           ║
║   URLs:       ws://bridge.localhost:${port}                ║
║               ws://localhost:${port}                      ║
║               ws://${hostIp}:${port}                      ║
║   Discovery:  http://bridge.localhost:${port + 10000}/bridge-info    ║
║                                                           ║
║   Waiting for editor connection...                        ║
║                                                           ║
║   Press Ctrl+C to stop                                    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

  wss.on('connection', (ws) => {
    console.log('✓ Editor connected');
    new ConnectionHandler(ws, REQUIRED_TOKEN);
  });

  function shutdown(signal: string): void {
    console.log(`\n👋 Shutting down bridge... (${signal})`);
    try {
      httpServer.close();
      wss.clients.forEach((c) => c.close());
      wss.close();
    } catch {}
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

async function main(): Promise<void> {
  const port = await findAvailablePort(START_PORT);
  if (port !== START_PORT) {
    console.log(`⚠ Port ${START_PORT} in use, using port ${port}`);
  }
  await startServer(port);
}

main().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
