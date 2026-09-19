'use client';

import { useEffect, useState } from 'react';
import { PlaybookCard } from './PlaybookCard';
import { PlaybookDetailPanel } from './PlaybookDetailPanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/api';

interface PlaybookListItem {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  stageCount: number;
  recommendedFor?: string[];
}

const CATEGORIES = [
  { value: 'all', label: '全部' },
  { value: 'scaffold', label: '搭建' },
  { value: 'audit', label: '审计' },
  { value: 'deploy', label: '部署' },
  { value: 'research', label: '研究' },
];

export function PlaybookLibrary() {
  const [playbooks, setPlaybooks] = useState<PlaybookListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .listPlaybooks(activeCategory === 'all' ? undefined : activeCategory)
      .then((data) => {
        setPlaybooks(data as PlaybookListItem[]);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '加载剧本失败');
        setLoading(false);
      });
  }, [activeCategory]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-md" />
        ))}
    </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-6">
        <h2 className="font-display text-xl font-medium tracking-[-0.01em] mb-1">编排剧本</h2>
        <p className="text-[12.5px] text-muted-foreground max-w-[50ch]">
          浏览和应用编排剧本，快速搭建、审计、部署或研究你的组织架构
      </p>
    </div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-[12px] font-mono">
          {error}
      </div>
      )}

      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList>
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c.value} value={c.value} className="text-[12px] gap-1.5">
              {c.label}
          </TabsTrigger>
          ))}
      </TabsList>

        <TabsContent value={activeCategory} className="mt-4">
          {playbooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4">
                <span className="text-muted-foreground text-lg"></span>
            </div>
              <p className="font-display text-base font-medium">未找到剧本</p>
              <p className="text-[12px] text-muted-foreground mt-1">
                尝试切换其他分类
            </p>
          </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {playbooks.map((p) => (
                <PlaybookCard key={p.id} playbook={p} onPreview={setPreviewId} />
              ))}
          </div>
          )}
      </TabsContent>
    </Tabs>

      <PlaybookDetailPanel
        playbookId={previewId}
        onClose={() => setPreviewId(null)}
     />
  </div>
  );
}