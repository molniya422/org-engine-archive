import { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRunStore } from '@/stores/run-store';
import { GatewayPromptBlock } from '@/components/GatewayPromptBlock';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { t } from '@/i18n';
import {
  ArrowLeft, Activity, Terminal, Wifi, WifiOff,
  ListOrdered, MessageSquare, Play, Pause, ClipboardCopy, Check,
} from 'lucide-react';

type TimelineEntry = { id: string; label: string; meta?: string; eventIndex: number };

export function RunMonitorView() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { currentRun, loading, error, logs, wsConnected, fetchRun, cancelRun, connectWs, disconnectWs } = useRunStore();
  const [autoScroll, setAutoScroll] = useState(true);
  const [activeTimelineId, setActiveTimelineId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const eventEndRef = useRef<HTMLDivElement>(null);
  const eventRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (runId) { fetchRun(runId); connectWs(runId); }
    return () => disconnectWs();
  }, [runId, fetchRun, connectWs, disconnectWs]);

  useEffect(() => {
    if (autoScroll) eventEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, currentRun?.events, autoScroll]);

  if (loading && !currentRun) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="space-y-4 w-96">
          <Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-full" /><Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error) return <div className="flex items-center justify-center h-64 text-destructive mono-num text-sm">{error}</div>;
  if (!currentRun) return <div className="flex items-center justify-center h-64 text-muted-foreground mono-num text-sm">{t('Run not found')}</div>;

  const lastEvent = currentRun.events[currentRun.events.length - 1];
  const gatewayPrompt = currentRun.status === 'awaiting_user' && lastEvent?.type === 'gateway_prompt' ? lastEvent : null;
  const isActive = currentRun.status === 'running' || currentRun.status === 'queued';

  const statusVariant: Record<string, 'default' | 'accent' | 'muted' | 'destructive' | 'outline'> = {
    queued: 'muted', running: 'accent', awaiting_user: 'outline', done: 'muted', cancelled: 'outline', blocked: 'destructive',
  };

  const timeline: TimelineEntry[] = useMemo(() => {
    const out: TimelineEntry[] = [];
    currentRun.events.forEach((ev, i) => {
      out.push({
        id: `evt-${i}`,
        label: ev.type || 'event',
        meta: [ev.layer ? `L${ev.layer}` : '', ev.phase || '', ev.node_id || '', ev.gateway ? `gw:${ev.gateway}` : ''].filter(Boolean).join(' · '),
        eventIndex: i,
      });
    });
    return out;
  }, [currentRun.events]);

  const copyAll = async () => {
    const text = currentRun.events.map((ev) => [ev.type, ev.layer ? `[L${ev.layer}]` : '', ev.phase || '', ev.node_id || '', ev.agent_name || ''].filter(Boolean).join(' ')).join('\n');
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  const scrollToEvent = (id: string) => {
    setActiveTimelineId(id); setAutoScroll(false);
    const el = eventRefs.current.get(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center h-11 px-4 border-b border-border chrome-hairline bg-background/95 shrink-0 gap-3">
        <Button size="sm" variant="ghost" onClick={() => navigate(-1)}><ArrowLeft size={14} /></Button>
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-accent" />
          <span className="font-display text-[14px] font-medium">运行控制台</span>
          <span className="font-mono text-[11px] text-muted-foreground ml-1">{currentRun.runId}</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
          {wsConnected ? <Wifi size={12} className="text-emerald-400" /> : <WifiOff size={12} className="text-destructive" />}
          {wsConnected ? '实时' : '离线'}
        </div>
        <Badge variant={statusVariant[currentRun.status] || 'outline'}>
          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse mr-1.5 inline-block" />}
          {t(currentRun.status)}
        </Badge>
        {currentRun.status === 'running' && <Button size="sm" variant="danger" onClick={cancelRun}>{t('Cancel')}</Button>}
        <Button size="sm" variant="outline" onClick={() => navigate(-1)}>{t('Back')}</Button>
      </header>

      {/* Meta Row */}
      <div className="px-4 py-2 border-b border-border flex gap-6 text-[11.5px] font-mono text-muted-foreground">
        <span className="truncate">{t('Task')}: <span className="text-foreground">{currentRun.task}</span></span>
        <span className="shrink-0">{t('Organization')}: <span className="text-foreground">{currentRun.orgId}</span></span>
      </div>

      {/* Three-Panel Console */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[200px_1fr_280px] overflow-hidden min-h-0">
        {/* Panel 1: Timeline */}
        <aside className="border-r border-border flex flex-col bg-card/40 min-h-0">
          <div className="flex items-center gap-2 h-9 px-3 border-b border-border shrink-0">
            <ListOrdered size={13} className="text-muted-foreground" />
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">时间线</span>
            <span className="ml-auto mono-num text-[11px] text-muted-foreground">{timeline.length}</span>
          </div>
          <ScrollArea className="flex-1">
            {timeline.length === 0 ? (
              <div className="p-3 text-[11px] text-muted-foreground font-mono">暂无事件</div>
            ) : (
              <div className="p-2 space-y-0.5">
                {timeline.map((entry) => (
                  <button key={entry.id} onClick={() => scrollToEvent(entry.id)}
                    className={`w-full text-left px-2 py-1.5 rounded-sm transition-colors font-mono text-[11px] ${activeTimelineId === entry.id ? 'bg-accent/10 text-accent' : 'text-foreground/80 hover:bg-secondary/40'}`}>
                    <div className="truncate">{entry.label}</div>
                    {entry.meta && <div className="text-[10px] text-muted-foreground truncate mt-0.5">{entry.meta}</div>}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </aside>

        {/* Panel 2: Event Stream */}
        <main className="flex flex-col min-h-0">
          <div className="flex items-center gap-2 h-9 px-3 border-b border-border shrink-0">
            <Terminal size={13} className="text-muted-foreground" />
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">事件流</span>
            <div className="flex-1" />
            <button onClick={() => setAutoScroll((v) => !v)}
              className={`flex items-center gap-1 px-2 h-7 rounded-sm font-mono text-[11px] transition-colors ${autoScroll ? 'text-accent bg-accent/10' : 'text-muted-foreground hover:text-foreground'}`}
              title={autoScroll ? '暂停自动滚动' : '恢复自动滚动'}>
              {autoScroll ? <Pause size={11} /> : <Play size={11} />}{autoScroll ? '自动' : '已暂停'}
            </button>
            <button onClick={copyAll} className="flex items-center gap-1 px-2 h-7 rounded-sm font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors" title="复制全部事件">
              {copied ? <Check size={11} className="text-emerald-400" /> : <ClipboardCopy size={11} />}{copied ? '已复制' : '复制'}
            </button>
            {isActive && <Badge variant="accent" className="text-[10px]">实时</Badge>}
          </div>
          <ScrollArea className="flex-1">
            {currentRun.events.length === 0 && logs.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-[12px] text-muted-foreground font-mono">
                {currentRun.status === 'queued' ? '等待编排引擎启动...' : currentRun.status === 'running' ? '编排引擎已启动，等待事件...' : '暂无日志'}
              </div>
            ) : (
              <div className="p-3 space-y-0.5 font-mono text-[11.5px] leading-relaxed">
                {currentRun.events.map((event, i) => {
                  const eventId = `evt-${i}`;
                  return (
                    <div key={eventId} ref={(el) => { if (el) eventRefs.current.set(eventId, el); }}
                      onClick={() => setActiveTimelineId(eventId)}
                      className={`flex gap-2 py-1 px-2 rounded cursor-pointer transition-colors ${activeTimelineId === eventId ? 'bg-accent/5 border-l-2 border-accent -ml-px pl-[7px]' : 'hover:bg-secondary/40'}`}>
                      <span className="text-muted-foreground/60 shrink-0 w-16">{event.type}</span>
                      <span className="text-foreground/80">
                        {event.layer && `[Layer ${event.layer}]`}{event.phase && ` ${event.phase}`}{event.node_id && ` ${event.node_id}`}
                        {event.gateway && ` Gateway: ${event.gateway}`}
                        {event.type === 'agent_started' && ` agent ${event.agent_name || ''} started`}
                        {event.type === 'agent_completed' && ` agent ${event.agent_name || ''} completed`}
                        {event.type === 'gateway_prompt' && ' awaiting user'}
                        {event.type === 'run_completed' && ` ${event.status === 'success' ? 'succeeded' : 'failed'}`}
                        {!event.layer && !event.phase && !event.type?.match(/^(agent_|run_|gateway_)/) && JSON.stringify(event).slice(0, 120)}
                      </span>
                    </div>
                  );
                })}
                {logs.map((log, i) => (
                  <div key={`log-${i}`} className="py-1 px-2 rounded text-muted-foreground hover:bg-secondary/40 transition-colors">{log}</div>
                ))}
                <div ref={eventEndRef} />
              </div>
            )}
          </ScrollArea>
        </main>

        {/* Panel 3: Gateway Decision */}
        <aside className="border-l border-border flex flex-col bg-card/40 min-h-0">
          <div className="flex items-center gap-2 h-9 px-3 border-b border-border shrink-0">
            <MessageSquare size={13} className="text-muted-foreground" />
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">网关决策</span>
          </div>
          <ScrollArea className="flex-1">
            {gatewayPrompt ? (
              <div className="p-3">
                <GatewayPromptBlock
                  gateway={gatewayPrompt.gateway}
                  context={gatewayPrompt.context}
                  question={gatewayPrompt.question}
                  onSubmit={(decision) => useRunStore.getState().submitDecision(gatewayPrompt.gateway, decision)}
                />
              </div>
            ) : (
              <div className="p-4 text-center text-[11px] text-muted-foreground font-mono">
                暂无活动网关
                <div className="mt-2 text-[10px] text-muted-foreground/60">等待编排决策</div>
              </div>
            )}
            {currentRun.events
              .filter((e: any) => e.type === 'gateway_decided')
              .map((e: any, i) => (
                <div key={`gd-${i}`} className="mx-3 mb-2 p-2 rounded-sm border border-border bg-background/40">
                  <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{e.gateway}</div>
                  <div className="font-mono text-[11px] text-foreground/80 mt-1 line-clamp-3">
                    {typeof e.decision === 'string' ? e.decision : JSON.stringify(e.decision)}
                  </div>
                </div>
              ))}
          </ScrollArea>
        </aside>
      </div>
    </div>
  );
}