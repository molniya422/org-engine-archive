import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRunStore } from '@/stores/run-store';
import { GatewayPromptBlock } from '@/components/GatewayPromptBlock';
import styles from './RunMonitorView.module.css';

export function RunMonitorView() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { currentRun, loading, error, fetchRun, cancelRun, connectWs, disconnectWs } = useRunStore();

  useEffect(() => {
    if (runId) {
      fetchRun(runId);
      connectWs(runId);
    }
    return () => disconnectWs();
  }, [runId, fetchRun, connectWs, disconnectWs]);

  if (loading) return <div className={styles.center}>Loading run...</div>;
  if (error) return <div className={styles.center} style={{ color: 'var(--color-error)' }}>{error}</div>;
  if (!currentRun) return <div className={styles.center}>Run not found</div>;

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

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Run Monitor</h2>
          <p className={styles.runId}>ID: {currentRun.runId}</p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.status} style={{ color: statusColors[currentRun.status] || 'inherit' }}>
            {currentRun.status}
          </span>
          {currentRun.status === 'running' && (
            <button className={styles.cancelBtn} onClick={cancelRun}>Cancel</button>
          )}
          <button className={styles.backBtn} onClick={() => navigate(-1)}>Back</button>
        </div>
      </header>

      <div className={styles.meta}>
        <span>Task: {currentRun.task}</span>
        <span>Organization: {currentRun.orgId}</span>
      </div>

      {gatewayPrompt && (
        <GatewayPromptBlock
          gateway={gatewayPrompt.gateway}
          context={gatewayPrompt.context}
          question={gatewayPrompt.question}
          onSubmit={(decision) => useRunStore.getState().submitDecision(gatewayPrompt.gateway, decision)}
        />
      )}

      <div className={styles.events}>
        <h3 className={styles.eventsTitle}>Events</h3>
        {currentRun.events.length === 0 ? (
          <p className={styles.noEvents}>No events yet</p>
        ) : (
          <div className={styles.eventList}>
            {currentRun.events.map((event, i) => (
              <div key={i} className={styles.event}>
                <span className={styles.eventType}>{event.type}</span>
                <span className={styles.eventTime}>
                  {event.layer && `Layer ${event.layer}`}
                  {event.phase && ` — ${event.phase}`}
                  {event.node_id && ` — ${event.node_id}`}
                  {event.gateway && ` — Gateway: ${event.gateway}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
