import { useToastStore } from '@/stores/toast-store';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

/**
 * Lightweight toast stack — no external dependency (sonner not installed).
 * Rendered once at app root; wired to useToastStore.
 */
export function Toaster() {
  const { toasts, dismiss } = useToastStore();

  if (toasts.length === 0) return null;

  const iconFor = (variant: string) => {
    switch (variant) {
      case 'success':
        return <CheckCircle size={15} className="text-emerald-400 shrink-0" />;
      case 'error':
        return <XCircle size={15} className="text-destructive shrink-0" />;
      default:
        return <Info size={15} className="text-accent shrink-0" />;
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 min-w-[240px] max-w-[360px]">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          data-testid="toast"
          data-variant={t.variant}
          className="flex items-start gap-2.5 rounded-md border border-border bg-background/95 backdrop-blur px-3.5 py-3 shadow-lg animate-in slide-in-from-bottom-2 fade-in"
        >
          {iconFor(t.variant)}
          <span className="text-[12.5px] leading-relaxed text-foreground flex-1">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label="关闭"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
