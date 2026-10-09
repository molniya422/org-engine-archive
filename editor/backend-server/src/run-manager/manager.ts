import { EventEmitter } from 'node:events';
import { OrchestratorClient } from '../orchestrator-adapter/client';
import { OrchestratorEvent } from '../orchestrator-adapter/protocol';
import { RunPersistence } from './persistence';

export type RunStatus = 'idle' | 'queued' | 'running' | 'awaiting_user' | 'done' | 'cancelled' | 'blocked';

export interface RunState {
  runId: string;
  status: RunStatus;
  gateway: string | null;
  orgId: string;
  task: string;
  events: OrchestratorEvent[];
  createdAt: string;
  updatedAt: string;
  /** Reason captured when status transitions to 'blocked'. */
  blockReason?: string;
}

/** Statuses that indicate an active (non-terminal) run. */
const ACTIVE_STATUSES: ReadonlySet<RunStatus> = new Set(['queued', 'running', 'awaiting_user']);

/** Default gateway timeout before an awaiting_user run is auto-blocked. */
const DEFAULT_GATEWAY_TIMEOUT_MS = 5 * 60 * 1000;

export class RunManager extends EventEmitter {
  private client: OrchestratorClient;
  private persistence: RunPersistence;
  private state: RunState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private gatewayTimeoutMs: number;

  constructor(client: OrchestratorClient, persistence: RunPersistence, gatewayTimeoutMs: number = DEFAULT_GATEWAY_TIMEOUT_MS) {
    super();
    this.client = client;
    this.persistence = persistence;
    this.gatewayTimeoutMs = gatewayTimeoutMs;
  }

  get current(): RunState | null { return this.state; }

  async start(orgId: string, task: string, configPath: string, outputDir: string, leanHooksDir?: string, workflowPath?: string): Promise<string> {
    if (this.state && ACTIVE_STATUSES.has(this.state.status)) {
      throw new Error(`Run already active: ${this.state.runId} (${this.state.status})`);
    }
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.state = { runId, status: 'queued', gateway: null, orgId, task, events: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await this.persistence.save(runId, this.state);
    this.client.on('event', this.onEvent);
    this.client.on('exit', this.onExit);
    this.client.on('stderr', (data: string) => this.emit('stderr', data));
    this.state.status = 'running';
    await this.persistence.save(runId, this.state);
    await this.client.start(configPath, task, outputDir, leanHooksDir, workflowPath).catch(async err => { await this.block(err.message); });
    return runId;
  }

  private onEvent = async (event: OrchestratorEvent) => {
    if (!this.state) return;
    this.state.events.push(event);
    this.state.updatedAt = new Date().toISOString();
    if (event.type === 'gateway_prompt') {
      this.state.status = 'awaiting_user';
      this.state.gateway = event.gateway;
      this.startGatewayTimer();
    } else if (event.type === 'run_completed') {
      this.state.status = event.status === 'success' ? 'done' : event.status;
      this.clearGatewayTimer();
      this.cleanup();
    }
    await this.persistence.save(this.state.runId, this.state);
    this.emit('event', event);
  };

  private onExit = async (code: number | null) => {
    if (this.state && !this.isTerminal(this.state.status)) {
      const reason = this.state.status === 'awaiting_user'
        ? `Process exited while waiting for user decision (code ${code})`
        : `Process exited with code ${code}`;
      await this.block(reason);
    }
  };

  async submitDecision(gateway: string, decision: unknown): Promise<void> {
    if (!this.state || this.state.status !== 'awaiting_user') throw new Error('No active gateway');
    await this.client.submitDecision(gateway, decision);
    this.state.status = 'running';
    this.state.gateway = null;
    this.state.updatedAt = new Date().toISOString();
    this.clearGatewayTimer();
    await this.persistence.save(this.state.runId, this.state);
  }

  async cancel(): Promise<void> {
    await this.client.cancel();
    if (this.state) { this.state.status = 'cancelled'; this.state.updatedAt = new Date().toISOString(); await this.persistence.save(this.state.runId, this.state); }
    this.clearGatewayTimer();
    this.cleanup();
  }

  private startGatewayTimer(): void {
    this.clearGatewayTimer();
    if (this.gatewayTimeoutMs <= 0) return;
    this.timer = setTimeout(() => { void this.block('等待用户确认超时'); }, this.gatewayTimeoutMs);
  }

  private clearGatewayTimer(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  private isTerminal(status: RunStatus): boolean {
    return status === 'done' || status === 'cancelled' || status === 'blocked';
  }

  private async block(reason: string): Promise<void> {
    if (this.state) { this.state.status = 'blocked'; this.state.blockReason = reason; this.state.updatedAt = new Date().toISOString(); await this.persistence.save(this.state.runId, this.state); }
    this.emit('blocked', reason);
    this.clearGatewayTimer();
    this.cleanup();
  }

  private cleanup(): void {
    this.client.stop();
    this.client.removeAllListeners();
    this.clearGatewayTimer();
  }
}
