import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useOrgStore } from '@/stores/org-store';
import { useUiStore } from '@/stores/ui-store';
import { OrgTreeView } from '@/components/OrgTreeView';
import { OrgCanvasView } from '@/components/OrgCanvasView';
import { RoleEditor } from '@/components/RoleEditor';
import styles from './StudioView.module.css';

export function StudioView() {
  const { orgId } = useParams<{ orgId: string }>();
  const { currentOrg, loading, error, loadOrg, saveOrg } = useOrgStore();
  const { editorTab, setEditorTab } = useUiStore();
  const [selectedRole, setSelectedRole] = useState<{ deptIdx: number; roleIdx: number } | null>(null);

  useEffect(() => {
    if (orgId && orgId !== 'new') loadOrg(orgId);
  }, [orgId, loadOrg]);

  const handleRoleSelect = (deptIdx: number, roleIdx: number) => {
    setSelectedRole({ deptIdx, roleIdx });
  };

  const handleRoleUpdate = (updatedRole: any) => {
    if (!currentOrg || !selectedRole) return;
    const dept = currentOrg.org.departments[selectedRole.deptIdx];
    if (dept) {
      dept.roles[selectedRole.roleIdx] = updatedRole;
      saveOrg(orgId!, currentOrg);
    }
  };

  const handleAddDepartment = () => {
    if (!currentOrg) return;
    currentOrg.org.departments.push({
      name: 'New Dept',
      roles: [{ name: 'lead', agentType: 'general-purpose', bound_skill: 'general-purpose' }],
    });
    saveOrg(orgId!, currentOrg);
  };

  const handleAddRole = (deptIdx: number) => {
    if (!currentOrg) return;
    currentOrg.org.departments[deptIdx].roles.push({
      name: 'new-role',
      agentType: 'general-purpose',
      bound_skill: 'general-purpose',
    });
    saveOrg(orgId!, currentOrg);
  };

  if (loading) return <div className={styles.center}>Loading...</div>;
  if (error) return <div className={styles.center} style={{ color: 'var(--color-error)' }}>{error}</div>;
  if (!currentOrg && orgId === 'new') {
    return (
      <div className={styles.center}>
        <p className={styles.emptyText}>Create a new organization to get started.</p>
        <p className={styles.emptyHint}>Use the Schema tab to understand the config structure.</p>
      </div>
    );
  }
  if (!currentOrg) return <div className={styles.center}>Organization not found</div>;

  const depts = currentOrg.org?.departments ?? [];

  return (
    <div className={styles.studio}>
      {/* Tab bar */}
      <div className={styles.tabBar}>
        <button
          className={`${styles.tab} ${editorTab === 'tree' ? styles.activeTab : ''}`}
          onClick={() => setEditorTab('tree')}
        >
          Tree View
        </button>
        <button
          className={`${styles.tab} ${editorTab === 'canvas' ? styles.activeTab : ''}`}
          onClick={() => setEditorTab('canvas')}
        >
          Canvas View
        </button>
        <div className={styles.tabActions}>
          <button className={styles.addBtn} onClick={handleAddDepartment}>+ Department</button>
        </div>
      </div>

      {/* Main content */}
      <div className={styles.content}>
        <div className={styles.panel}>
          {editorTab === 'tree' ? (
            <OrgTreeView
              departments={depts}
              selectedRole={selectedRole}
              onRoleSelect={handleRoleSelect}
              onAddRole={handleAddRole}
            />
          ) : (
            <OrgCanvasView departments={depts} />
          )}
        </div>

        <aside className={styles.editor}>
          <RoleEditor
            selectedRole={selectedRole}
            departments={depts}
            onUpdate={handleRoleUpdate}
          />
        </aside>
      </div>
    </div>
  );
}
