import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';
import { OrchestratorEvent } from './protocol';

export class OrchestratorClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private rl: ReturnType<typeof createInterface> | null = null;
  private requestId = 0;
  private pending = new Map<number, { resolve: Function; reject: Function }>();
  private _active = false;
  get active(): boolean { return this._active; }

  async start(configPath: string, taskDescription: string, outputDir: string, cwd?: string): Promise<void> {
    if (this._active) throw new Error('Adapter already active');
    this.process = spawn('python', [
      '-m', 'harness.orchestrator_adapter',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: cwd || process.env.LEAN_HOOKS_DIR || process.cwd(),
    });
    this.rl = createInterface({ input: this.process.stdout! });
    this.rl.on('line', (line: string) => {
      try {
        const msg = JSON.parse(line);
        if (msg.method === 'event') this.emit('event', msg.params as OrchestratorEvent);
        else if (msg.id !== undefined && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
        }
      } catch { /* skip malformed */ }
    });
    this.process.on('exit', (code) => { this._active = false; this.emit('exit', code); });
    this.process.stderr?.on('data', (data: Buffer) => { this.emit('stderr', data.toString()); });
    this._active = true;
    return this.call('start_run', { org_config_path: configPath, task_description: taskDescription, output_dir: outputDir }).then(() => undefined);
  }

  async submitDecision(gateway: string, decision: unknown): Promise<void> {
    return this.call('submit_decision', { gateway, decision }).then(() => undefined);
  }
  async cancel(): Promise<void> {
    return this.call('cancel_run', {}).then(() => undefined);
  }
  stop(): void {
    if (this.process) { this.process.kill('SIGTERM'); setTimeout(() => this.process?.kill('SIGKILL'), 5000); }
    this._active = false;
  }

  private call(method: string, params: object): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pending.set(id, { resolve, reject });
      this.process?.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
}
