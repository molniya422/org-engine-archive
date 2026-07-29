import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { t } from '@/i18n';
import styles from './OrgTreeView.module.css';
function SortableRole({ role, deptIdx, roleIdx, isSelected, onSelect }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: `role-${deptIdx}-${roleIdx}`,
    });
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
    return (_jsxs("div", { ref: setNodeRef, style: style, className: `${styles.role} ${isSelected ? styles.selectedRole : ''}`, onClick: onSelect, children: [_jsx("span", { className: styles.dragHandle, ...attributes, ...listeners, children: "\u283F" }), _jsxs("div", { className: styles.roleInfo, children: [_jsx("span", { className: styles.roleName, children: role.name }), _jsx("span", { className: styles.roleAgent, children: role.agentType })] })] }));
}
export function OrgTreeView({ departments, selectedRole, onRoleSelect, onAddRole }) {
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
    const handleDragEnd = (event) => {
        // dnd-kit sortable handles reordering internally
        // Full save integration deferred — see Canvas View for state persistence
    };
    return (_jsx("div", { className: styles.tree, children: departments.map((dept, deptIdx) => (_jsxs("div", { className: styles.dept, children: [_jsxs("div", { className: styles.deptHeader, children: [_jsx("span", { className: styles.deptName, children: dept.name }), _jsx("button", { className: styles.addRoleBtn, onClick: () => onAddRole(deptIdx), children: t('+ Role') })] }), _jsx(DndContext, { sensors: sensors, collisionDetection: closestCenter, onDragEnd: handleDragEnd, children: _jsx(SortableContext, { items: dept.roles.map((_, ri) => `role-${deptIdx}-${ri}`), strategy: verticalListSortingStrategy, children: dept.roles.map((role, roleIdx) => (_jsx(SortableRole, { role: role, deptIdx: deptIdx, roleIdx: roleIdx, isSelected: selectedRole?.deptIdx === deptIdx && selectedRole?.roleIdx === roleIdx, onSelect: () => onRoleSelect(deptIdx, roleIdx) }, `role-${deptIdx}-${roleIdx}`))) }) })] }, deptIdx))) }));
}
