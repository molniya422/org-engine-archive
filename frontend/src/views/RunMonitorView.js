import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRunStore } from '@/stores/run-store';
import { GatewayPromptBlock } from '@/components/GatewayPromptBlock';
import { t } from '@/i18n';
import styles from './RunMonitorView.module.css';
export function RunMonitorView() {
    const { runId } = useParams();
    const navigate = useNavigate();
    const { currentRun, loading, error, logs, wsConnected, fetchRun, cancelRun, connectWs, disconnectWs } = useRunStore();
    const logEndRef = useRef(null);
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
    if (loading && !currentRun)
        return _jsx("div", { className: styles.center, children: t('Loading run...') });
    if (error)
        return _jsx("div", { className: styles.center, style: { color: 'var(--color-error)' }, children: error });
    if (!currentRun)
        return _jsx("div", { className: styles.center, children: t('Run not found') });
    const lastEvent = currentRun.events[currentRun.events.length - 1];
    const gatewayPrompt = currentRun.status === 'awaiting_user' && lastEvent?.type === 'gateway_prompt' ? lastEvent : null;
    const statusColors = {
        queued: 'var(--color-text-muted)',
        running: 'var(--color-primary)',
        awaiting_user: 'var(--color-warning)',
        done: 'var(--color-success)',
        cancelled: 'var(--color-text-muted)',
        blocked: 'var(--color-error)',
    };
    // Determine if spinner should show
    const isActive = currentRun.status === 'running' || currentRun.status === 'queued';
    return (_jsxs("div", { className: styles.container, children: [_jsxs("header", { className: styles.header, children: [_jsxs("div", { children: [_jsx("h2", { className: styles.title, children: t('Run Monitor') }), _jsxs("p", { className: styles.runId, children: [t('ID'), ": ", currentRun.runId] })] }), _jsxs("div", { className: styles.headerActions, children: [_jsxs("span", { className: styles.connStatus, children: [_jsx("span", { className: `${styles.connDot} ${wsConnected ? styles.connOn : styles.connOff}` }), wsConnected ? '已连接' : '未连接'] }), _jsxs("span", { className: `${styles.statusBadge} ${isActive ? styles.statusActive : ''}`, style: { color: statusColors[currentRun.status] || 'inherit' }, children: [isActive && _jsx("span", { className: styles.spinner }), t(currentRun.status)] }), currentRun.status === 'running' && (_jsx("button", { className: styles.cancelBtn, onClick: cancelRun, children: t('Cancel') })), _jsx("button", { className: styles.backBtn, onClick: () => navigate(-1), children: t('Back') })] })] }), _jsxs("div", { className: styles.meta, children: [_jsxs("span", { children: [t('Task'), ": ", currentRun.task] }), _jsxs("span", { children: [t('Organization'), ": ", currentRun.orgId] })] }), gatewayPrompt && (_jsx(GatewayPromptBlock, { gateway: gatewayPrompt.gateway, context: gatewayPrompt.context, question: gatewayPrompt.question, onSubmit: (decision) => useRunStore.getState().submitDecision(gatewayPrompt.gateway, decision) })), _jsxs("div", { className: styles.logPanel, children: [_jsxs("h3", { className: styles.logTitle, children: ["\u8FD0\u884C\u65E5\u5FD7", isActive && _jsx("span", { className: styles.logLive, children: "LIVE" })] }), logs.length === 0 && currentRun.events.length === 0 ? (_jsx("p", { className: styles.noLogs, children: currentRun.status === 'queued'
                            ? '等待编排引擎启动...'
                            : currentRun.status === 'running'
                                ? '编排引擎已启动，等待事件...'
                                : '暂无日志' })) : (_jsxs("div", { className: styles.logList, children: [currentRun.events.map((event, i) => (_jsxs("div", { className: `${styles.logEntry} ${styles.logEvent}`, children: [_jsx("span", { className: styles.logTime, children: event.type }), _jsxs("span", { className: styles.logMsg, children: [event.layer && `[Layer ${event.layer}]`, event.phase && ` ${event.phase}`, event.node_id && ` — ${event.node_id}`, event.gateway && ` — Gateway: ${event.gateway}`, event.type === 'agent_started' && ` 智能体 ${event.agent_name || ''} 启动`, event.type === 'agent_completed' && ` 智能体 ${event.agent_name || ''} 完成`, event.type === 'gateway_prompt' && ` 等待用户决策`, event.type === 'run_completed' && ` 运行${event.status === 'success' ? '成功' : '失败'}`, !event.layer && !event.phase && !event.type?.match(/^(agent_|run_|gateway_)/) && JSON.stringify(event).slice(0, 120)] })] }, `evt-${i}`))), logs.map((log, i) => (_jsx("div", { className: styles.logEntry, children: _jsx("span", { className: styles.logMsg, children: log }) }, `log-${i}`))), _jsx("div", { ref: logEndRef })] }))] })] }));
}
