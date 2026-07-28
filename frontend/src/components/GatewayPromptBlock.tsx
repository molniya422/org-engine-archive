import { useState } from 'react';
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
        <span className={styles.badge}>Gateway: {gateway}</span>
        <span className={styles.label}>Awaiting Your Decision</span>
      </div>

      <div className={styles.question}>{question}</div>

      {context ? (
        <details className={styles.context}>
          <summary>Context</summary>
          <pre className={styles.contextPre}>{JSON.stringify(context, null, 2)}</pre>
        </details>
      ) : null}

      <div className={styles.inputRow}>
        <input
          className={styles.input}
          placeholder="Enter your decision or instructions..."
          value={decision}
          onChange={e => setDecision(e.target.value)}
          disabled={submitting}
        />
        <button className={styles.submitBtn} onClick={handleSubmit} disabled={!decision.trim() || submitting}>
          {submitting ? 'Sending...' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
