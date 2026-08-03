import { useState } from 'react';
import { t } from '@/i18n';

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
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="bg-secondary text-secondary-foreground text-xs px-2 py-0.5 rounded">{t('Gateway')}: {gateway}</span>
        <span className="text-xs text-muted-foreground">{t('Awaiting Your Decision')}</span>
      </div>

      <div className="text-sm font-medium">{question}</div>

      {context ? (
        <details className="text-sm">
          <summary>{t('Context')}</summary>
          <pre className="bg-muted p-2 rounded text-xs overflow-x-auto mt-1">{JSON.stringify(context, null, 2)}</pre>
        </details>
      ) : null}

      <div className="flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-1.5 text-sm"
          placeholder={t('Enter your decision or instructions...')}
          value={decision}
          onChange={e => setDecision(e.target.value)}
          disabled={submitting}
        />
        <button className="px-4 py-1.5 bg-primary text-primary-foreground text-sm rounded hover:bg-primary/90 disabled:opacity-50" onClick={handleSubmit} disabled={!decision.trim() || submitting}>
          {submitting ? t('Sending...') : t('Submit')}
        </button>
      </div>
    </div>
  );
}
