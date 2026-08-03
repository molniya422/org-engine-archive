let cachedPort: number | null = null;

async function getWsHost(): Promise<string> {
  if (window.location.protocol !== 'file:') {
    // Dev mode: use browser host
    return location.host;
  }
  if (cachedPort) return `localhost:${cachedPort}`;
  try {
    const port = await (window as any).electronAPI?.getServerPort?.();
    if (port) { cachedPort = port; return `localhost:${port}`; }
  } catch { /* fall through */ }
  return 'localhost:5172';
}

type MessageHandler = (data: any) => void;

/** Well-known event types the RunWsClient may receive. */
export type RunWsEvent =
  | { type: 'phase_started'; layer: string; phase: string }
  | { type: 'executor_dispatched'; role: string; dept: string; node_id: string }
  | { type: 'executor_completed'; node_id: string; skill_used: string; verdict: string }
  | { type: 'audit_passed'; node_id: string }
  | { type: 'audit_failed'; node_id: string; reason: string }
  | { type: 'product_key_issued'; node_id: string; product_key: string }
  | { type: 'gateway_prompt'; gateway: string; context: unknown; question: string }
  | { type: 'run_completed'; status: 'success' | 'blocked' | 'cancelled'; error?: string }
  // ── workflow v2 事件 ──
  | { type: 'meeting_started'; meeting: { type: string; dept?: string; participants: string[] } }
  | { type: 'meeting_cycle'; meeting: { type: string; cycle: number; verdicts: Record<string, string>; decision: string } }
  | { type: 'message_mediated'; message: { sender: string; recipient: string; channel?: string; verdict: string; reason: string } }
  | { type: 'decision_recorded'; decision: { meeting: string; output: unknown; target: string } };

export class RunWsClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<MessageHandler>();
  private url = '';

  async connect(runId: string): Promise<void> {
    this.disconnect();
    const host = await getWsHost();
    this.url = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${host}/ws/runs/${runId}`;
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handlers.forEach(h => h(data));
      } catch { /* skip malformed */ }
    };
    this.ws.onclose = () => {
      // Reconnect after 3s if not intentionally closed
      if (this.ws) setTimeout(() => this.connect(runId), 3000);
    };
    this.ws.onerror = () => { /* onclose fires after */ };
  }

  disconnect(): void {
    if (this.ws) {
      const old = this.ws;
      this.ws = null;
      old.onclose = null;
      old.close();
    }
  }

  on(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  get connected(): boolean { return this.ws?.readyState === WebSocket.OPEN; }
}
