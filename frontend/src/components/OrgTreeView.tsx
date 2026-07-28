import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './OrgTreeView.module.css';

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
    <div ref={setNodeRef} style={style} className={`${styles.role} ${isSelected ? styles.selectedRole : ''}`}
      onClick={onSelect}
    >
      <span className={styles.dragHandle} {...attributes} {...listeners}>⠿</span>
      <div className={styles.roleInfo}>
        <span className={styles.roleName}>{role.name}</span>
        <span className={styles.roleAgent}>{role.agentType}</span>
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
    <div className={styles.tree}>
      {departments.map((dept, deptIdx) => (
        <div key={deptIdx} className={styles.dept}>
          <div className={styles.deptHeader}>
            <span className={styles.deptName}>{dept.name}</span>
            <button className={styles.addRoleBtn} onClick={() => onAddRole(deptIdx)}>+ Role</button>
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
