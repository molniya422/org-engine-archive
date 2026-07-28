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
}

export class RunManager extends EventEmitter {
  private client: OrchestratorClient;
  private persistence: RunPersistence;
  private state: RunState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(client: OrchestratorClient, persistence: RunPersistence) {
    super();
    this.client = client;
    this.persistence = persistence;
  }

  get current(): RunState | null { return this.state; }

  async start(orgId: string, task: string, configPath: string, outputDir: string, leanHooksDir?: string): Promise<string> {
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.state = { runId, status: 'queued', gateway: null, orgId, task, events: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await this.persistence.save(runId, this.state);
    this.client.on('event', this.onEvent);
    this.client.on('exit', this.onExit);
    this.client.on('stderr', (data: string) => this.emit('stderr', data));
    this.state.status = 'running';
    await this.persistence.save(runId, this.state);
    await this.client.start(configPath, task, outputDir, leanHooksDir).catch(async err => { await this.block(err.message); });
    return runId;
  }

  private onEvent = async (event: OrchestratorEvent) => {
    if (!this.state) return;
    this.state.events.push(event);
    this.state.updatedAt = new Date().toISOString();
    if (event.type === 'gateway_prompt') { this.state.status = 'awaiting_user'; this.state.gateway = event.gateway; }
    else if (event.type === 'run_completed') { this.state.status = event.status === 'success' ? 'done' : event.status; this.cleanup(); }
    await this.persistence.save(this.state.runId, this.state);
    this.emit('event', event);
  };

  private onExit = async (code: number | null) => {
    if (this.state && this.state.status === 'running') { await this.block(`Process exited with code ${code}`); }
  };

  async submitDecision(gateway: string, decision: unknown): Promise<void> {
    if (!this.state || this.state.status !== 'awaiting_user') throw new Error('No active gateway');
    await this.client.submitDecision(gateway, decision);
    this.state.status = 'running';
    this.state.gateway = null;
    this.state.updatedAt = new Date().toISOString();
    await this.persistence.save(this.state.runId, this.state);
  }

  async cancel(): Promise<void> {
    await this.client.cancel();
    if (this.state) { this.state.status = 'cancelled'; this.state.updatedAt = new Date().toISOString(); await this.persistence.save(this.state.runId, this.state); }
    this.cleanup();
  }

  private async block(reason: string): Promise<void> {
    if (this.state) { this.state.status = 'blocked'; this.state.updatedAt = new Date().toISOString(); await this.persistence.save(this.state.runId, this.state); }
    this.emit('blocked', reason);
    this.cleanup();
  }

  private cleanup(): void {
    this.client.stop();
    this.client.removeAllListeners();
    if (this.timer) clearTimeout(this.timer);
  }
}
