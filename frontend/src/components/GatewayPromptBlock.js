import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from 'react';
import { t } from '@/i18n';
import styles from './GatewayPromptBlock.module.css';
export function GatewayPromptBlock({ gateway, context, question, onSubmit }) {
    const [decision, setDecision] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            await onSubmit({ text: decision });
        }
        finally {
            setSubmitting(false);
        }
    };
    return (_jsxs("div", { className: styles.block, children: [_jsxs("div", { className: styles.header, children: [_jsxs("span", { className: styles.badge, children: [t('Gateway'), ": ", gateway] }), _jsx("span", { className: styles.label, children: t('Awaiting Your Decision') })] }), _jsx("div", { className: styles.question, children: question }), context ? (_jsxs("details", { className: styles.context, children: [_jsx("summary", { children: t('Context') }), _jsx("pre", { className: styles.contextPre, children: JSON.stringify(context, null, 2) })] })) : null, _jsxs("div", { className: styles.inputRow, children: [_jsx("input", { className: styles.input, placeholder: t('Enter your decision or instructions...'), value: decision, onChange: e => setDecision(e.target.value), disabled: submitting }), _jsx("button", { className: styles.submitBtn, onClick: handleSubmit, disabled: !decision.trim() || submitting, children: submitting ? t('Sending...') : t('Submit') })] })] }));
}
