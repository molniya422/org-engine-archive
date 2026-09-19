import { useEffect } from 'react';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useSkillsStore } from '@/stores/skills-store';
import { useOrgStore } from '@/stores/org-store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MousePointerClick, X, Trash2, Building2 } from 'lucide-react';
import { BindingCheckPanel } from '../binding/BindingCheckPanel';

const TYPE_LABEL: Record<string, string> = {
  agent: '智能体',
  skill: '技能',
  decision: '决策',
  parallel: '并行',
  channel: '频道',
  meeting: '会议',
};

const KNOWN_TYPES = ['agent', 'skill', 'decision', 'parallel', 'channel', 'meeting'] as const;

export function PropertiesPanel() {
  const { selectedNode, updateNodeData, setSelectedNode, removeNodeById } = useWorkflowStore();
  const { skills, fetchSkills } = useSkillsStore();
  const currentOrg = useOrgStore((s) => s.currentOrg);
  // org 角色注册表：role_ref 强绑定下拉的数据源
  const orgRoles = currentOrg?.org?.departments?.flatMap((d: any) => d.roles ?? []) ?? [];

  // 加载当前技能库，供「技能」下拉选择使用
  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  if (!selectedNode) {
    return (
      <div className="p-6 text-[12.5px] text-muted-foreground text-center">
        <div className="mb-3 flex justify-center">
          <MousePointerClick size={22} className="text-muted-foreground/50" />
       </div>
        选择画布上的节点以编辑属性
     </div>
    );
  }

  const data = (selectedNode.data ?? {}) as Record<string, unknown>;
  const dataType = data.type as string | undefined;
  const orgRef = data.orgRef as { kind?: string; deptIdx?: number; roleIdx?: number } | undefined;

  const updateField = (field: string, value: unknown) => {
    updateNodeData(selectedNode.id, { [field]: value });
  };

  // 解析类型显示：如果在白名单内则显示中文标签，否则显示原始值或"未知"
  const typeDisplay = (() => {
    if (!dataType) return '未知';
    return TYPE_LABEL[dataType] ?? dataType;
  })();

  const isKnownType = KNOWN_TYPES.includes(dataType as typeof KNOWN_TYPES[number]);

  return (
    <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-medium">节点属性</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { removeNodeById(selectedNode.id); setSelectedNode(null); }}
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            title="删除此节点"
          >
            <Trash2 size={13} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setSelectedNode(null)} className="h-6 w-6">
            <X size={13} />
          </Button>
        </div>
      </div>

      <div>
        <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">类型</Label>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="outline">{typeDisplay}</Badge>
          {!isKnownType && (
            <span className="text-[10px] text-amber-500 font-mono">未识别的类型</span>
          )}
       </div>
     </div>

      {orgRef?.deptIdx !== undefined && (
        <div className="rounded-sm border border-border bg-muted/30 px-2.5 py-2">
          <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">组织绑定</Label>
          <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-accent">
            <Building2 size={12} />
            {orgRef.kind === 'role'
              ? `部门 D${orgRef.deptIdx + 1} · 角色 R${(orgRef.roleIdx ?? 0) + 1}`
              : `部门 D${orgRef.deptIdx + 1}`}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            此节点由组织结构生成，删除/修改不影响 org 配置。
          </p>
        </div>
      )}

      {/* Agent 编辑器 */}
      {dataType === 'agent' && (
        <>
          <div>
            <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">组织角色 (role_ref)</Label>
            <Select
              value={(data.roleRef as string) || ''}
              onValueChange={(v) => updateField('roleRef', v)}
            >
              <SelectTrigger className="mt-1 h-8 text-[12px]">
                <SelectValue placeholder="绑定 org 角色…" />
              </SelectTrigger>
              <SelectContent>
                {orgRoles.length === 0 && (
                  <div className="px-2 py-1.5 text-[11px] text-muted-foreground">组织暂无角色，请先在组织页创建</div>
                )}
                {orgRoles.map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>{r.id} · {r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">role_ref 强绑定组织角色；运行时从 org 解析身份</p>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">角色</Label>
            <Input
              value={(data.role as string) || ''}
              onChange={(e) => updateField('role', e.target.value)}
              className="mt-1"
              placeholder="如：研究员"
            />
         </div>
          <div>
            <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">目标</Label>
            <textarea
              className="mt-1 w-full min-h-[60px] rounded-sm border border-input bg-background px-3 py-2 font-mono text-[12px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              value={(data.goal as string) || ''}
              onChange={(e) => updateField('goal', e.target.value)}
              placeholder="该智能体应完成什么任务？"
            />
         </div>
          <div>
            <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">背景</Label>
            <textarea
              className="mt-1 w-full min-h-[60px] rounded-sm border border-input bg-background px-3 py-2 font-mono text-[12px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              value={(data.backstory as string) || ''}
              onChange={(e) => updateField('backstory', e.target.value)}
              placeholder="智能体的背景上下文"
            />
         </div>
          <div>
            <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">模型</Label>
            <Input
              value={(data.llm as string) || ''}
              onChange={(e) => updateField('llm', e.target.value)}
              className="mt-1"
              placeholder="default"
            />
         </div>
          <div>
            <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">技能</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(data.skills as string[] | undefined)?.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded-sm bg-accent/10 text-accent px-1.5 py-0.5 text-[11px] font-mono">
                  {s}
                  <button
                    type="button"
                    className="hover:text-destructive"
                    title="移除技能"
                    onClick={() => updateField('skills', ((data.skills as string[]) || []).filter((x) => x !== s))}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              {((data.skills as string[] | undefined) ?? []).length === 0 && (
                <span className="text-[11px] text-muted-foreground">未绑定技能</span>
              )}
            </div>
            <Select
              value=""
              onValueChange={(v) => {
                const current = (data.skills as string[] | undefined) ?? [];
                if (v && !current.includes(v)) updateField('skills', [...current, v]);
              }}
            >
              <SelectTrigger className="mt-1.5 h-8 text-[12px]">
                <SelectValue placeholder="从技能库选择技能…" />
              </SelectTrigger>
              <SelectContent>
                {skills.length === 0 && (
                  <div className="px-2 py-1.5 text-[11px] text-muted-foreground">技能库为空，请先到「技能」页扫描</div>
                )}
                {Array.from(new Set(skills.filter((s) => s.source === 'skill').map((s) => s.name))).sort().map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">从当前技能库下拉选择，可添加多个</p>
         </div>
        </>
      )}

      {/* Skill 编辑器 */}
      {dataType === 'skill' && (
        <>
          <div>
            <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">技能 ID</Label>
            <Input
              value={(data.skillId as string) || ''}
              onChange={(e) => updateField('skillId', e.target.value)}
              className="mt-1"
              placeholder="web-search"
            />
         </div>
          <div>
            <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">超时 (秒)</Label>
            <Input
              type="number"
              value={String((data.timeout as number) || 60)}
              onChange={(e) => updateField('timeout', parseInt(e.target.value) || 60)}
              className="mt-1"
            />
         </div>
        </>
      )}

      {/* Decision 编辑器 */}
      {dataType === 'decision' && (
        <div>
          <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">条件</Label>
          <Input
            value={(data.condition as string) || ''}
            onChange={(e) => updateField('condition', e.target.value)}
            className="mt-1"
            placeholder="如：results.length > 0"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            满足：底端口 · 不满足：右端口
         </p>
       </div>
      )}

      {/* Parallel 编辑器 */}
      {dataType === 'parallel' && (
        <>
          <div>
            <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">分支</Label>
            <p className="text-[12px] text-muted-foreground mt-1">
              从底端口连接多个节点以创建分支
           </p>
         </div>
          <div>
            <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">合并策略</Label>
            <select
              className="mt-1 flex h-10 w-full rounded-sm border border-input bg-background px-3 py-2 text-[12.5px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              value={(data.mergeStrategy as string) || 'all'}
              onChange={(e) => updateField('mergeStrategy', e.target.value)}
            >
              <option value="all">全部完成 (等待所有)</option>
              <option value="any">任一完成 (首个即可)</option>
           </select>
         </div>
        </>
      )}

      {/* Channel 编辑器 */}
      {dataType === 'channel' && (
        <div>
          <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">频道 Key</Label>
          <Input
            value={(data.channelKey as string) || ''}
            onChange={(e) => updateField('channelKey', e.target.value)}
            className="mt-1"
            placeholder="如 api-design"
          />
          <p className="text-[10px] text-muted-foreground mt-1">共享通信频道；读写 ACL 由引擎端按角色 id 强制</p>
        </div>
      )}

      {/* Meeting 编辑器 */}
      {dataType === 'meeting' && (
        <>
          <div>
            <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">会议类型</Label>
            <select
              className="mt-1 flex h-10 w-full rounded-sm border border-input bg-background px-3 py-2 text-[12.5px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              value={(data.meetingType as string) || 'ministerial'}
              onChange={(e) => updateField('meetingType', e.target.value)}
            >
              <option value="dept_internal">部门内</option>
              <option value="ministerial">部长级</option>
              <option value="decision">决策</option>
            </select>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">议程</Label>
            <textarea
              className="mt-1 w-full min-h-[60px] rounded-sm border border-input bg-background px-3 py-2 font-mono text-[12px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              value={(data.agenda as string) || ''}
              onChange={(e) => updateField('agenda', e.target.value)}
              placeholder="会议要解决什么？"
            />
          </div>
        </>
      )}

      {/* 回退显示：data.type 缺失或不在白名单中时显示原始数据 */}
      {!isKnownType && (
        <div>
          <p className="text-[12px] text-muted-foreground">
            此节点类型（{dataType ?? '未指定'}）缺少专用编辑器。以下为节点原始数据：
         </p>
          <pre className="mt-2 text-[11px] font-mono text-muted-foreground max-h-[240px] overflow-auto rounded-sm border border-border bg-muted/30 p-2 whitespace-pre-wrap break-all">
            {JSON.stringify(data, null, 2)}
         </pre>
       </div>
      )}

      <div className="mt-4">
        <BindingCheckPanel />
      </div>
   </div>
  );
}
