#!/usr/bin/env node

import WebSocket from 'ws';
import { ConnectionHandler } from './connection-handler';

const PORT = parseInt(process.env.PORT || '3001', 10);
const REQUIRED_TOKEN = process.env.TERMINAL_BRIDGE_TOKEN || null;

const wss = new WebSocket.Server({
  port: PORT,
  host: '127.0.0.1',
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

wss.on('connection', (ws) => {
  console.log('✓ Editor connected');
  new ConnectionHandler(ws, REQUIRED_TOKEN);
});

function shutdown(signal: string): void {
  console.log(`\n👋 Shutting down bridge... (${signal})`);
  try {
    wss.clients.forEach((c) => c.close());
    wss.close();
  } catch {}
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
