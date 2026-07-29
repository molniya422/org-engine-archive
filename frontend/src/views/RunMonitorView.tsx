import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRunStore } from '@/stores/run-store';
import { GatewayPromptBlock } from '@/components/GatewayPromptBlock';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { t } from '@/i18n';

export function RunMonitorView() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { currentRun, loading, error, logs, wsConnected, fetchRun, cancelRun, connectWs, disconnectWs } = useRunStore();
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (runId) {
      fetchRun(runId);
      connectWs(runId);
    }
    return () => disconnectWs();
  }, [runId, fetchRun, connectWs, disconnectWs]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (loading && !currentRun) return (
    <div className="flex items-center justify-center h-64">
      <div className="space-y-4 w-96">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-64 text-destructive">{error}</div>
  );

  if (!currentRun) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">{t('Run not found')}</div>
  );

  const lastEvent = currentRun.events[currentRun.events.length - 1];
  const gatewayPrompt = currentRun.status === 'awaiting_user' && lastEvent?.type === 'gateway_prompt' ? lastEvent : null;
  const isActive = currentRun.status === 'running' || currentRun.status === 'queued';

  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    queued: 'secondary',
    running: 'default',
    awaiting_user: 'outline',
    done: 'secondary',
    cancelled: 'outline',
    blocked: 'destructive',
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{t('Run Monitor')}</h2>
          <p className="text-sm text-muted-foreground">{t('ID')}: {currentRun.runId}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
            {wsConnected ? '已连接' : '未连接'}
          </div>
          <Badge variant={statusVariant[currentRun.status] || 'outline'}>
            {isActive && <span className="w-2 h-2 rounded-full bg-current animate-pulse mr-1.5 inline-block" />}
            {t(currentRun.status)}
          </Badge>
          {currentRun.status === 'running' && (
            <Button size="sm" variant="destructive" onClick={cancelRun}>{t('Cancel')}</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => navigate(-1)}>{t('Back')}</Button>
        </div>
      </div>

      {/* Meta info */}
      <div className="flex gap-6 text-sm text-muted-foreground">
        <span>{t('Task')}: {currentRun.task}</span>
        <span>{t('Organization')}: {currentRun.orgId}</span>
      </div>

      {gatewayPrompt && (
        <GatewayPromptBlock
          gateway={gatewayPrompt.gateway}
          context={gatewayPrompt.context}
          question={gatewayPrompt.question}
          onSubmit={(decision) => useRunStore.getState().submitDecision(gatewayPrompt.gateway, decision)}
        />
      )}

      {/* Log panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            运行日志
            {isActive && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 animate-pulse">
                LIVE
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            {logs.length === 0 && currentRun.events.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                {currentRun.status === 'queued'
                  ? '等待编排引擎启动...'
                  : currentRun.status === 'running'
                  ? '编排引擎已启动，等待事件...'
                  : '暂无日志'}
              </div>
            ) : (
              <div className="space-y-1 font-mono text-xs">
                {currentRun.events.map((event, i) => (
                  <div key={`evt-${i}`} className="flex gap-2 py-1 px-2 rounded hover:bg-muted/50">
                    <span className="text-muted-foreground shrink-0 w-16">{event.type}</span>
                    <span>
                      {event.layer && `[Layer ${event.layer}]`}
                      {event.phase && ` ${event.phase}`}
                      {event.node_id && ` — ${event.node_id}`}
                      {event.gateway && ` — Gateway: ${event.gateway}`}
                      {event.type === 'agent_started' && ` 智能体 ${event.agent_name || ''} 启动`}
                      {event.type === 'agent_completed' && ` 智能体 ${event.agent_name || ''} 完成`}
                      {event.type === 'gateway_prompt' && ` 等待用户决策`}
                      {event.type === 'run_completed' && ` 运行${event.status === 'success' ? '成功' : '失败'}`}
                      {!event.layer && !event.phase && !event.type?.match(/^(agent_|run_|gateway_)/) && JSON.stringify(event).slice(0, 120)}
                    </span>
                  </div>
                ))}
                {logs.map((log, i) => (
                  <div key={`log-${i}`} className="py-1 px-2 rounded hover:bg-muted/50 text-muted-foreground">
                    {log}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
