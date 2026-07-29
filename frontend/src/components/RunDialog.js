import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import styles from './RunDialog.module.css';
export function RunDialog({ orgId, open, onClose }) {
    const navigate = useNavigate();
    const [task, setTask] = useState('');
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState(null);
    if (!open)
        return null;
    const handleStart = async () => {
        if (!task.trim())
            return;
        setStarting(true);
        setError(null);
        try {
            const result = await api.startRun(orgId, task.trim());
            onClose();
            navigate(`/studio/${orgId}/runs/${result.run_id}`);
        }
        catch (e) {
            setError(e?.message ?? String(e));
        }
        finally {
            setStarting(false);
        }
    };
    return (_jsx("div", { className: styles.overlay, onClick: onClose, children: _jsxs("div", { className: styles.dialog, onClick: e => e.stopPropagation(), children: [_jsx("h2", { className: styles.title, children: "\u542F\u52A8\u8FD0\u884C" }), _jsx("p", { className: styles.hint, children: "\u4F7F\u7528\u5F53\u524D\u7EC4\u7EC7\u914D\u7F6E\u8FD0\u884C\u591A\u667A\u80FD\u4F53\u7F16\u6392\u3002\u8F93\u5165\u4EFB\u52A1\u63CF\u8FF0\u540E\u70B9\u51FB\u542F\u52A8\u3002" }), error && _jsx("div", { className: styles.error, children: error }), _jsxs("div", { className: styles.field, children: [_jsx("label", { className: styles.label, children: "\u4EFB\u52A1\u63CF\u8FF0" }), _jsx("textarea", { className: styles.textarea, value: task, onChange: e => setTask(e.target.value), placeholder: "\u4F8B\u5982\uFF1A\u5B9E\u73B0\u7528\u6237\u6CE8\u518C\u529F\u80FD\uFF0C\u5305\u62EC\u524D\u7AEF\u9875\u9762\u548C\u540E\u7AEF API", disabled: starting, autoFocus: true, rows: 4 })] }), _jsxs("div", { className: styles.actions, children: [_jsx("button", { className: styles.cancelBtn, onClick: onClose, disabled: starting, children: "\u53D6\u6D88" }), _jsx("button", { className: styles.startBtn, onClick: handleStart, disabled: !task.trim() || starting, children: starting ? '启动中...' : '🚀 启动运行' })] })] }) }));
}
