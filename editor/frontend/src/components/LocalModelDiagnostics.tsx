import { useEffect, useState } from 'react';
import { personalApi, type ProviderHealthReport } from '@/api/personal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

/**
 * P2.4 — local model diagnostics (plan: 小白可以判断系统能不能工作，
 * 不需要阅读终端日志).
 *
 * Shows: provider, model, offline status, context length, last health check.
 * Distinguishes: model missing / not loaded / JSON unsupported.
 * Makes the core promise explicit: 无本地模型时只能使用规则和手动模式.
 */
export function LocalModelDiagnostics() {
  const [report, setReport] = useState<ProviderHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await personalApi.modelHealth();
      setReport(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">本地模型</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {error && (
          <div className="flex items-start gap-2 text-destructive">
            <XCircle className="h-4 w-4 mt-0.5" />
            <span>无法获取模型状态：{error}</span>
          </div>
        )}

        {!loading && report && (
          <>
            <div className="flex items-start gap-2">
              {report.ok ? (
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
              )}
              <div className="space-y-1">
                <div>{report.detail}</div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted-foreground">
                  <dt>提供方</dt><dd>{report.provider === 'fake' ? '测试模式' : report.provider}</dd>
                  <dt>模型</dt><dd>{report.model ?? '未指定'}</dd>
                  <dt>离线状态</dt>
                  <dd>{report.local_only ? '仅本地运行，不会联网' : '—'}</dd>
                  <dt>上下文长度</dt>
                  <dd>{report.context_length ? `${report.context_length} tokens` : '未知'}</dd>
                  <dt>JSON 支持</dt>
                  <dd>{report.json_mode ? '支持' : '不支持（将使用规则模式生成结构化输出）'}</dd>
                  <dt>已加载模型</dt>
                  <dd>{report.models_loaded.length ? report.models_loaded.join('、') : '无'}</dd>
                  <dt>最近检查</dt><dd>{report.checked_at}</dd>
                </dl>
              </div>
            </div>

            {report.models_loaded.length === 0 && report.provider !== 'none' && report.provider !== 'fake' && (
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-800">
                模型缺失：未检测到已加载的本地模型。请先安装并启动本地模型（如 Ollama），再导入模型配置。
              </div>
            )}
            {report.json_mode === false && report.ok && (
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-800">
                该模型后端不支持 JSON 输出。系统将回退到规则模式生成结构化结果。
              </div>
            )}
            {!report.ok && (
              <div className="rounded border bg-muted p-2">
                <div className="font-medium">{report.fallback_options[0]}</div>
                <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                  {report.fallback_options.slice(1).map((line: string) => (
                    <li key={line}>{line.replace('· ', '')}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {loading && !report && <div className="text-muted-foreground">正在检查本地模型…</div>}
      </CardContent>
    </Card>
  );
}
