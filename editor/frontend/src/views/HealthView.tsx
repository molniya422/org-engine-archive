import { HealthPanel } from '@/components/HealthPanel';
import { LocalModelDiagnostics } from '@/components/LocalModelDiagnostics';

export function HealthView() {
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <LocalModelDiagnostics />
      <HealthPanel />
   </div>
  );
}
