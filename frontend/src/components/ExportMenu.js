import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
import { api } from '@/api/client';
import { t } from '@/i18n';
import styles from './ExportMenu.module.css';
function getConfigPath(orgId) {
    // Matches the backend's yaml-io BASE_DIR: ~/.org-engine-editor/orgs/<id>.yaml
    return `~/.org-engine-editor/orgs/${orgId}.yaml`;
}
export function ExportMenu({ orgId, orgName }) {
    const [open, setOpen] = useState(false);
    const [status, setStatus] = useState('idle');
    const [statusText, setStatusText] = useState('');
    const menuRef = useRef(null);
    const configPath = getConfigPath(orgId);
    // Close on click outside
    useEffect(() => {
        if (!open)
            return;
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target))
                setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);
    const download = async (format) => {
        setStatus('loading');
        try {
            const text = await api.exportOrg(orgId, format);
            const ext = format === 'yaml' ? 'yaml' : 'json';
            const blob = new Blob([text], { type: format === 'yaml' ? 'text/yaml' : 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${orgName}.${ext}`;
            a.click();
            URL.revokeObjectURL(url);
            setStatus('idle');
            setOpen(false);
        }
        catch {
            setStatus('error');
            setStatusText('导出失败');
        }
    };
    const copy = async (text, label) => {
        setStatus('loading');
        try {
            await navigator.clipboard.writeText(text);
            setStatus('copied');
            setStatusText(`✓ ${label} 已复制`);
            setTimeout(() => { setStatus('idle'); setStatusText(''); }, 2500);
        }
        catch {
            setStatus('error');
            setStatusText('复制失败');
        }
    };
    const claudeCodeCmd = `# 直接在 Claude Code 中运行编排（需要 lean-hooks 环境）：
python -m harness.orchestrator_adapter \\
  --org-config "${configPath}" \\
  --task "<你的任务描述>"

# 或者在编辑器内使用 "▶ 运行" 按钮（推荐）`;
    return (_jsxs("div", { className: styles.wrapper, ref: menuRef, children: [_jsxs("button", { className: styles.trigger, onClick: () => setOpen(o => !o), disabled: status === 'loading', children: [status === 'copied' ? statusText : status === 'loading' ? '...' : t('Export'), " \u25BE"] }), open && (_jsxs("div", { className: styles.menu, children: [_jsxs("div", { className: styles.section, children: [_jsx("div", { className: styles.sectionTitle, children: "\uD83D\uDCC4 \u4E0B\u8F7D\u6587\u4EF6" }), _jsx("button", { className: styles.item, onClick: () => download('yaml'), children: "\u4E0B\u8F7D YAML" }), _jsx("button", { className: styles.item, onClick: () => download('json'), children: "\u4E0B\u8F7D JSON" })] }), _jsxs("div", { className: styles.section, children: [_jsx("div", { className: styles.sectionTitle, children: "\uD83D\uDCCB \u590D\u5236\u5230\u526A\u8D34\u677F" }), _jsx("button", { className: styles.item, onClick: () => copy(configPath, '路径'), children: "\u590D\u5236\u914D\u7F6E\u6587\u4EF6\u8DEF\u5F84" }), _jsx("button", { className: styles.item, onClick: async () => {
                                    const text = await api.exportOrg(orgId, 'yaml');
                                    copy(text, 'YAML');
                                }, children: "\u590D\u5236 YAML \u5185\u5BB9" })] }), _jsxs("div", { className: styles.section, children: [_jsx("div", { className: styles.sectionTitle, children: "\uD83E\uDD16 Claude Code \u96C6\u6210" }), _jsxs("div", { className: styles.deployHint, children: [_jsx("p", { children: "\u914D\u7F6E\u6587\u4EF6\u5DF2\u81EA\u52A8\u4FDD\u5B58\u5230\uFF1A" }), _jsx("code", { className: styles.blockCode, children: configPath }), _jsx("p", { style: { marginTop: 10 }, children: "\u5728 Claude Code \u4E2D\u8FD0\u884C\u7F16\u6392\uFF1A" }), _jsx("pre", { className: styles.pre, children: _jsxs("code", { children: ["python -m harness.orchestrator_adapter \\ --org-config \"", configPath, "\" \\ --task \"\u4F60\u7684\u4EFB\u52A1\u63CF\u8FF0\""] }) }), _jsx("p", { style: { marginTop: 10 }, children: "\u6216\u901A\u8FC7\u7F16\u8F91\u5668\u4E00\u952E\u8FD0\u884C\uFF08\u63A8\u8350\uFF09\uFF1A" }), _jsxs("ul", { className: styles.ul, children: [_jsx("li", { children: "\u6253\u5F00\u7EC4\u7EC7\u7F16\u8F91\u5668" }), _jsxs("li", { children: ["\u70B9\u51FB ", _jsx("strong", { children: "\u25B6 \u8FD0\u884C" }), " \u6309\u94AE"] }), _jsx("li", { children: "\u8F93\u5165\u4EFB\u52A1\u63CF\u8FF0\u5373\u53EF\u542F\u52A8" })] }), _jsx("p", { style: { marginTop: 10, color: 'var(--color-text-secondary)' }, children: "\uD83D\uDCA1 \u8FD0\u884C\u72B6\u6001\u4F1A\u5728\u9996\u9875\u548C\u7F16\u8F91\u5668\u4E2D\u5B9E\u65F6\u663E\u793A\u3002" })] })] }), _jsxs("div", { className: styles.section, children: [_jsx("div", { className: styles.sectionTitle, children: "\uD83D\uDCC1 \u6587\u4EF6\u4F4D\u7F6E" }), _jsxs("div", { className: styles.deployHint, children: ["\u914D\u7F6E\u6587\u4EF6\u5B58\u50A8\u4F4D\u7F6E\uFF1A", _jsx("code", { className: styles.blockCode, children: configPath }), "\u7F16\u8F91\u5668\u542F\u52A8\u8FD0\u884C\u65F6\uFF0C\u7F16\u6392\u5F15\u64CE\u4F1A\u81EA\u52A8\u8BFB\u53D6\u6B64\u6587\u4EF6\u3002"] })] })] })), status === 'error' && (_jsx("div", { className: styles.toast, children: statusText || '操作失败' }))] }));
}
