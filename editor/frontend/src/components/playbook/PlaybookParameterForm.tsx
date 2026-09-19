import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface PlaybookParameter {
  key: string;
  label: string;
  type: 'select' | 'textarea' | 'number' | 'string';
  required?: boolean;
  help?: string;
  options?: { label: string; value: string }[];
  placeholder?: string;
  defaultValue?: string | number;
}

interface PlaybookParameterFormProps {
  parameters: PlaybookParameter[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  errors?: Record<string, string>;
}

export function PlaybookParameterForm({
  parameters,
  values,
  onChange,
  errors = {},
}: PlaybookParameterFormProps) {
  if (parameters.length === 0) {
    return (
      <p className="text-[12.5px] text-muted-foreground font-mono">无需参数</p>
    );
  }

  return (
    <div className="space-y-4">
      {parameters.map((param) => (
        <div key={param.key} className="space-y-1.5">
          <Label className="font-mono text-[12px]">
            {param.label}
            {param.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>

          {param.help && (
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">{param.help}</p>
          )}

          {param.type === 'select' ? (
            <select
              value={values[param.key] ?? ''}
              onChange={(e) => onChange(param.key, e.target.value)}
              className="flex h-9 w-full rounded-sm border border-border bg-background px-3 py-2 chrome-hairline font-mono text-[12.5px] leading-none placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="" disabled>
                请选择...
              </option>
              {param.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : param.type === 'textarea' ? (
            <textarea
              value={values[param.key] ?? ''}
              onChange={(e) => onChange(param.key, e.target.value)}
              placeholder={param.placeholder}
              rows={4}
              className="flex w-full rounded-sm border border-border bg-background px-3 py-2 chrome-hairline font-mono text-[12.5px] leading-relaxed placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 resize-y"
            />
          ) : (
            <Input
              type={param.type === 'number' ? 'number' : 'text'}
              value={values[param.key] ?? ''}
              onChange={(e) => onChange(param.key, e.target.value)}
              placeholder={param.placeholder}
            />
          )}

          {errors[param.key] && (
            <p className="text-[11px] text-destructive font-mono">{errors[param.key]}</p>
          )}
        </div>
      ))}
    </div>
  );
}
