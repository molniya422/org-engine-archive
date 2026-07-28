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
