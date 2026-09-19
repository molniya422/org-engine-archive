'use client';

import { useEffect, useState } from 'react';
import { TemplateCard } from './TemplateCard';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/api';

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  builtIn: boolean;
}

const categories = [
  { value: 'all', label: '全部' },
  { value: 'scaffold', label: '脚手架' },
  { value: 'audit', label: '审计' },
  { value: 'deploy', label: '部署' },
  { value: 'research', label: '研究' },
];

export function TemplateLibrary() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.listTemplates(activeCategory === 'all' ? undefined : activeCategory)
      .then((data) => {
        setTemplates(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '加载模板失败');
        setLoading(false);
      });
  }, [activeCategory]);

  const handleApply = async (id: string) => {
    try {
      const t = await api.getTemplate(id);
      if (t && t.template) {
        const { useWorkflowStore } = await import('@/stores/workflow-store');
        useWorkflowStore.getState().loadWorkflow(t.template.nodes, t.template.edges);
      }
    } catch (err) {
      console.error('应用模板失败:', err);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-6">
        <h2 className="font-display text-xl font-medium tracking-[-0.01em] mb-1">工作流模板</h2>
        <p className="text-[12.5px] text-muted-foreground max-w-[50ch]">
          浏览内置模板或应用模板以启动新工作流
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-[12px] font-mono">
          {error}
        </div>
      )}

      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList>
          {categories.map((c) => (
            <TabsTrigger key={c.value} value={c.value} className="text-[12px] gap-1.5">
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={activeCategory} className="mt-4">
          {templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4">
                <span className="text-muted-foreground text-lg">?</span>
              </div>
              <p className="font-display text-base font-medium">未找到模板</p>
              <p className="text-[12px] text-muted-foreground mt-1">
                请尝试选择其他分类
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((t) => (
                <TemplateCard key={t.id} template={t} onApply={handleApply} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}