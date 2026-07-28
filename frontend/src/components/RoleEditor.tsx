import { useState, useEffect } from 'react';
import styles from './RoleEditor.module.css';

interface Role {
  name: string;
  agentType: string;
  bound_skill: string;
  [key: string]: any;
}

interface Department {
  name: string;
  roles: Role[];
}

interface RoleEditorProps {
  selectedRole: { deptIdx: number; roleIdx: number } | null;
  departments: Department[];
  onUpdate: (role: Role) => void;
}

export function RoleEditor({ selectedRole, departments, onUpdate }: RoleEditorProps) {
  const [localRole, setLocalRole] = useState<Role | null>(null);

  useEffect(() => {
    if (selectedRole === null) { setLocalRole(null); return; }
    const role = departments[selectedRole.deptIdx]?.roles[selectedRole.roleIdx];
    setLocalRole(role ? { ...role } : null);
  }, [selectedRole, departments]);

  if (!selectedRole || !localRole) {
    return (
      <div className={styles.panel}>
        <h3 className={styles.title}>Role Editor</h3>
        <p className={styles.hint}>Select a role from the tree to edit its properties.</p>
      </div>
    );
  }

  const handleChange = (field: string, value: string) => {
    const updated = { ...localRole, [field]: value };
    setLocalRole(updated);
    onUpdate(updated);
  };

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Edit Role</h3>
      <div className={styles.field}>
        <label className={styles.label}>Name</label>
        <input className={styles.input} value={localRole.name} onChange={e => handleChange('name', e.target.value)} />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Agent Type</label>
        <input className={styles.input} value={localRole.agentType} onChange={e => handleChange('agentType', e.target.value)} />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Bound Skill</label>
        <input className={styles.input} value={localRole.bound_skill} onChange={e => handleChange('bound_skill', e.target.value)} />
      </div>
      {localRole.context_note !== undefined && (
        <div className={styles.field}>
          <label className={styles.label}>Context Note</label>
          <textarea className={styles.textarea} value={localRole.context_note} onChange={e => handleChange('context_note', e.target.value)} />
        </div>
      )}
    </div>
  );
}
