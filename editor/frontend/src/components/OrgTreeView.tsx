import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { t } from '@/i18n';

interface Role {
  name: string;
  agentType: string;
  bound_skill: string;
}

interface Department {
  name: string;
  roles: Role[];
}

interface OrgTreeViewProps {
  departments: Department[];
  selectedRole: { deptIdx: number; roleIdx: number } | null;
  onRoleSelect: (deptIdx: number, roleIdx: number) => void;
  onAddRole: (deptIdx: number) => void;
}

function SortableRole({ role, deptIdx, roleIdx, isSelected, onSelect }: {
  role: Role; deptIdx: number; roleIdx: number;
  isSelected: boolean; onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `role-${deptIdx}-${roleIdx}`,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-accent ${isSelected ? 'bg-accent' : ''}`}
      onClick={onSelect}
    >
      <span className="cursor-grab text-muted-foreground" {...attributes} {...listeners}>⠿</span>
      <div className="flex flex-col">
        <span className="text-sm font-medium">{role.name}</span>
        <span className="text-xs text-muted-foreground">{role.agentType}</span>
      </div>
    </div>
  );
}

export function OrgTreeView({ departments, selectedRole, onRoleSelect, onAddRole }: OrgTreeViewProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    // dnd-kit sortable handles reordering internally
    // Full save integration deferred — see Canvas View for state persistence
  };

  return (
    <div className="space-y-2">
      {departments.map((dept, deptIdx) => (
        <div key={deptIdx} className="border rounded p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold">{dept.name}</span>
            <button className="text-xs px-2 py-0.5 border rounded hover:bg-accent" onClick={() => onAddRole(deptIdx)}>{t('+ Role')}</button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={dept.roles.map((_, ri) => `role-${deptIdx}-${ri}`)} strategy={verticalListSortingStrategy}>
              {dept.roles.map((role, roleIdx) => (
                <SortableRole
                  key={`role-${deptIdx}-${roleIdx}`}
                  role={role}
                  deptIdx={deptIdx}
                  roleIdx={roleIdx}
                  isSelected={selectedRole?.deptIdx === deptIdx && selectedRole?.roleIdx === roleIdx}
                  onSelect={() => onRoleSelect(deptIdx, roleIdx)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      ))}
    </div>
  );
}
