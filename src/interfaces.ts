export interface SpawnOptions {
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: { [key: string]: string };
  shell?: string;
  args?: string[];
}

export interface TerminalOptions extends SpawnOptions {
  cols?: number;
  rows?: number;
}

export interface TerminalConfig {
  maxTerminals: number;
  idleTimeoutMs: number;
  ownerGraceMs: number;
  historyLimitEvents: number;
}

export const DEFAULT_CONFIG: TerminalConfig = {
  maxTerminals: 4,
  idleTimeoutMs: 15 * 60 * 1000,
  ownerGraceMs: 5 * 60 * 1000,
  historyLimitEvents: 500,
};

export interface HistoryEvent {
  t: number;
  type: 'create' | 'in' | 'out' | 'resize' | 'close' | 'exit';
  data?: string;
  cols?: number;
  rows?: number;
  code?: number;
  shell?: string;
  cwd?: string;
  token?: string;
}

export interface TerminalInfo {
  id: number;
  createdAt: number;
  lastActive: number;
  closed: boolean;
}

export interface CreateResult {
  id: number;
  token: string;
}

export interface CreateError {
  error: string;
}

export type CreateResponse = CreateResult | CreateError;

export interface ClientMessage {
  type: string;
  id?: number;
  data?: string;
  cols?: number;
  rows?: number;
  shell?: string;
  cwd?: string;
  maxTerminals?: number;
  idleTimeoutMs?: number;
  ownerGraceMs?: number;
  historyLimitEvents?: number;
  token?: string;
}

export interface ServerMessage {
  type: string;
  id?: number;
  data?: string;
  cols?: number;
  rows?: number;
  createdAt?: number;
  terminals?: TerminalInfo[];
  events?: HistoryEvent[];
  message?: string;
  ok?: boolean;
  options?: TerminalConfig;
  code?: number;
}
