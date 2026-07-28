import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRunStore } from '@/stores/run-store';
import { GatewayPromptBlock } from '@/components/GatewayPromptBlock';
import { t } from '@/i18n';
import styles from './RunMonitorView.module.css';

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

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (loading && !currentRun) return <div className={styles.center}>{t('Loading run...')}</div>;
  if (error) return <div className={styles.center} style={{ color: 'var(--color-error)' }}>{error}</div>;
  if (!currentRun) return <div className={styles.center}>{t('Run not found')}</div>;

  const lastEvent = currentRun.events[currentRun.events.length - 1];
  const gatewayPrompt = currentRun.status === 'awaiting_user' && lastEvent?.type === 'gateway_prompt' ? lastEvent : null;

  const statusColors: Record<string, string> = {
    queued: 'var(--color-text-muted)',
    running: 'var(--color-primary)',
    awaiting_user: 'var(--color-warning)',
    done: 'var(--color-success)',
    cancelled: 'var(--color-text-muted)',
    blocked: 'var(--color-error)',
  };

  // Determine if spinner should show
  const isActive = currentRun.status === 'running' || currentRun.status === 'queued';

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{t('Run Monitor')}</h2>
          <p className={styles.runId}>{t('ID')}: {currentRun.runId}</p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.connStatus}>
            <span className={`${styles.connDot} ${wsConnected ? styles.connOn : styles.connOff}`} />
            {wsConnected ? '已连接' : '未连接'}
          </span>
          <span className={`${styles.statusBadge} ${isActive ? styles.statusActive : ''}`}
            style={{ color: statusColors[currentRun.status] || 'inherit' }}>
            {isActive && <span className={styles.spinner} />}
            {t(currentRun.status)}
          </span>
          {currentRun.status === 'running' && (
            <button className={styles.cancelBtn} onClick={cancelRun}>{t('Cancel')}</button>
          )}
          <button className={styles.backBtn} onClick={() => navigate(-1)}>{t('Back')}</button>
        </div>
      </header>

      <div className={styles.meta}>
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
      <div className={styles.logPanel}>
        <h3 className={styles.logTitle}>
          运行日志
          {isActive && <span className={styles.logLive}>LIVE</span>}
        </h3>
        {logs.length === 0 && currentRun.events.length === 0 ? (
          <p className={styles.noLogs}>
            {currentRun.status === 'queued'
              ? '等待编排引擎启动...'
              : currentRun.status === 'running'
              ? '编排引擎已启动，等待事件...'
              : '暂无日志'}
          </p>
        ) : (
          <div className={styles.logList}>
            {/* Show orchestrator events as log entries */}
            {currentRun.events.map((event, i) => (
              <div key={`evt-${i}`} className={`${styles.logEntry} ${styles.logEvent}`}>
                <span className={styles.logTime}>{event.type}</span>
                <span className={styles.logMsg}>
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
            {/* Show stderr logs */}
            {logs.map((log, i) => (
              <div key={`log-${i}`} className={styles.logEntry}>
                <span className={styles.logMsg}>{log}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
