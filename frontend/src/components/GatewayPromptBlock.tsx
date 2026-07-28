import { useState } from 'react';
import { t } from '@/i18n';
import styles from './GatewayPromptBlock.module.css';

interface GatewayPromptBlockProps {
  gateway: string;
  context: unknown;
  question: string;
  onSubmit: (decision: unknown) => void;
}

export function GatewayPromptBlock({ gateway, context, question, onSubmit }: GatewayPromptBlockProps) {
  const [decision, setDecision] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit({ text: decision });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.block}>
      <div className={styles.header}>
        <span className={styles.badge}>{t('Gateway')}: {gateway}</span>
        <span className={styles.label}>{t('Awaiting Your Decision')}</span>
      </div>

      <div className={styles.question}>{question}</div>

      {context ? (
        <details className={styles.context}>
          <summary>{t('Context')}</summary>
          <pre className={styles.contextPre}>{JSON.stringify(context, null, 2)}</pre>
        </details>
      ) : null}

      <div className={styles.inputRow}>
        <input
          className={styles.input}
          placeholder={t('Enter your decision or instructions...')}
          value={decision}
          onChange={e => setDecision(e.target.value)}
          disabled={submitting}
        />
        <button className={styles.submitBtn} onClick={handleSubmit} disabled={!decision.trim() || submitting}>
          {submitting ? t('Sending...') : t('Submit')}
        </button>
      </div>
    </div>
  );
}
