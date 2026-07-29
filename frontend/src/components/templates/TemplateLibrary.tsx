import { useEffect, useState } from 'react';
import { TemplateCard } from './TemplateCard';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  builtIn: boolean;
}

const categories = [
  { value: 'all', label: 'All' },
  { value: 'scaffold', label: 'Scaffold' },
  { value: 'audit', label: 'Audit' },
  { value: 'deploy', label: 'Deploy' },
  { value: 'research', label: 'Research' },
];

export function TemplateLibrary() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => {
    setLoading(true);
    const params = activeCategory !== 'all' ? `?category=${activeCategory}` : '';
    fetch(`/api/v1/templates${params}`)
      .then((r) => r.json())
      .then((data) => {
        setTemplates(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeCategory]);

  const handleApply = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/templates/${id}`);
      const t = await res.json();
      if (t.template) {
        const { useWorkflowStore } = await import('@/stores/workflow-store');
        useWorkflowStore.getState().loadWorkflow(t.template.nodes, t.template.edges);
      }
    } catch (err) {
      console.error('Failed to apply template:', err);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-1">Workflow Templates</h2>
        <p className="text-sm text-muted-foreground">
          Browse built-in templates or apply one to start a new workflow
        </p>
      </div>
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList>
          {categories.map((c) => (
            <TabsTrigger key={c.value} value={c.value}>
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={activeCategory} className="mt-4">
          {templates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg">No templates found</p>
              <p className="text-sm">Try selecting a different category</p>
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
