import { TerminalConfig, DEFAULT_CONFIG } from './interfaces';

export { DEFAULT_CONFIG };

export class ConfigManager {
  private config: TerminalConfig;
  private configured: boolean = false;

  constructor(config: Partial<TerminalConfig> = {}) {
    this.config = {
      maxTerminals: config.maxTerminals ?? DEFAULT_CONFIG.maxTerminals,
      idleTimeoutMs: config.idleTimeoutMs ?? DEFAULT_CONFIG.idleTimeoutMs,
      ownerGraceMs: config.ownerGraceMs ?? DEFAULT_CONFIG.ownerGraceMs,
      historyLimitEvents: config.historyLimitEvents ?? DEFAULT_CONFIG.historyLimitEvents,
    };
  }

  update(config: Partial<TerminalConfig>): void {
    if (typeof config.maxTerminals === 'number') {
      this.config.maxTerminals = Math.max(1, config.maxTerminals);
    }
    if (typeof config.idleTimeoutMs === 'number') {
      this.config.idleTimeoutMs = Math.max(1000, config.idleTimeoutMs);
    }
    if (typeof config.ownerGraceMs === 'number') {
      this.config.ownerGraceMs = Math.max(0, config.ownerGraceMs);
    }
    if (typeof config.historyLimitEvents === 'number') {
      this.config.historyLimitEvents = Math.max(10, config.historyLimitEvents);
    }
    this.configured = true;
  }

  getConfig(): TerminalConfig {
    return { ...this.config };
  }

  isConfigured(): boolean {
    return this.configured;
  }

  getMaxTerminals(): number {
    return this.config.maxTerminals;
  }

  getIdleTimeoutMs(): number {
    return this.config.idleTimeoutMs;
  }

  getOwnerGraceMs(): number {
    return this.config.ownerGraceMs;
  }

  getHistoryLimitEvents(): number {
    return this.config.historyLimitEvents;
  }
}
