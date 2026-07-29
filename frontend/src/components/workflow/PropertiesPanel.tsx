import { useWorkflowStore } from '@/stores/workflow-store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

export function PropertiesPanel() {
  const { selectedNode, updateNodeData, setSelectedNode } = useWorkflowStore();

  if (!selectedNode) {
    return (
      <div className="p-6 text-sm text-gray-400 dark:text-gray-500 text-center">
        <div className="text-2xl mb-2">👆</div>
        Select a node on the canvas to edit its properties
      </div>
    );
  }

  const data = selectedNode.data as Record<string, unknown>;

  const updateField = (field: string, value: unknown) => {
    updateNodeData(selectedNode.id, { [field]: value });
  };

  return (
    <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Properties</h3>
        <Button variant="ghost" size="sm" onClick={() => setSelectedNode(null)} className="h-6 w-6 p-0">
          ✕
        </Button>
      </div>
      <div>
        <Label className="text-xs font-medium">Type</Label>
        <div className="mt-1">
          <Badge variant="outline" className="capitalize">
            {(data.type as string) || 'unknown'}
          </Badge>
        </div>
      </div>
      {(data.type as string) === 'agent' && (
        <>
          <div>
            <Label className="text-xs font-medium">Role</Label>
            <Input
              value={(data.role as string) || ''}
              onChange={(e) => updateField('role', e.target.value)}
              className="mt-1"
              placeholder="e.g. Researcher"
            />
          </div>
          <div>
            <Label className="text-xs font-medium">Goal</Label>
            <textarea
              className="mt-1 w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={(data.goal as string) || ''}
              onChange={(e) => updateField('goal', e.target.value)}
              placeholder="What should this agent do?"
            />
          </div>
          <div>
            <Label className="text-xs font-medium">Backstory</Label>
            <textarea
              className="mt-1 w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={(data.backstory as string) || ''}
              onChange={(e) => updateField('backstory', e.target.value)}
              placeholder="Agent background context"
            />
          </div>
          <div>
            <Label className="text-xs font-medium">LLM</Label>
            <Input
              value={(data.llm as string) || ''}
              onChange={(e) => updateField('llm', e.target.value)}
              className="mt-1"
              placeholder="default"
            />
          </div>
          <div>
            <Label className="text-xs font-medium">Skills</Label>
            <Input
              value={(data.skills as string[])?.join(', ') || ''}
              onChange={(e) => updateField('skills', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
              className="mt-1"
              placeholder="skill1, skill2"
            />
            <p className="text-[10px] text-gray-400 mt-1">Comma-separated skill names</p>
          </div>
        </>
      )}
      {(data.type as string) === 'skill' && (
        <>
          <div>
            <Label className="text-xs font-medium">Skill ID</Label>
            <Input
              value={(data.skillId as string) || ''}
              onChange={(e) => updateField('skillId', e.target.value)}
              className="mt-1"
              placeholder="web-search"
            />
          </div>
          <div>
            <Label className="text-xs font-medium">Timeout (s)</Label>
            <Input
              type="number"
              value={String((data.timeout as number) || 60)}
              onChange={(e) => updateField('timeout', parseInt(e.target.value) || 60)}
              className="mt-1"
            />
          </div>
        </>
      )}
      {(data.type as string) === 'decision' && (
        <div>
          <Label className="text-xs font-medium">Condition</Label>
          <Input
            value={(data.condition as string) || ''}
            onChange={(e) => updateField('condition', e.target.value)}
            className="mt-1"
            placeholder="e.g. results.length > 0"
          />
          <p className="text-[10px] text-gray-400 mt-1">
            True branch: bottom port · False branch: right port
          </p>
        </div>
      )}
      {(data.type as string) === 'parallel' && (
        <>
          <div>
            <Label className="text-xs font-medium">Branches</Label>
            <p className="text-sm text-muted-foreground mt-1">
              Connect multiple nodes from the bottom port to create branches
            </p>
          </div>
          <div>
            <Label className="text-xs font-medium">Merge Strategy</Label>
            <select
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={(data.mergeStrategy as string) || 'all'}
              onChange={(e) => updateField('mergeStrategy', e.target.value)}
            >
              <option value="all">All (wait for all)</option>
              <option value="any">Any (first complete)</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
}
