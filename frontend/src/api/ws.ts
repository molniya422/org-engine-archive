type MessageHandler = (data: any) => void;

export class RunWsClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<MessageHandler>();
  private url = '';

  connect(runId: string): void {
    this.disconnect();
    this.url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/runs/${runId}`;
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
