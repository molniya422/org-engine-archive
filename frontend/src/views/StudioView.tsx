import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useOrgStore } from '@/stores/org-store';
import { useUiStore } from '@/stores/ui-store';
import { OrgTreeView } from '@/components/OrgTreeView';
import { OrgCanvasView } from '@/components/OrgCanvasView';
import { RoleEditor } from '@/components/RoleEditor';
import { NewOrgForm } from '@/components/NewOrgForm';
import { ExportMenu } from '@/components/ExportMenu';
import { RunDialog } from '@/components/RunDialog';
import { WorkflowCanvas, WorkflowToolbar, PropertiesPanel, useWorkflowStore } from '@/components/workflow';
import { t } from '@/i18n';
import styles from './StudioView.module.css';

export function StudioView() {
  const { orgId } = useParams<{ orgId: string }>();
  const { currentOrg, loading, error, loadOrg, saveOrg } = useOrgStore();
  const { editorTab, setEditorTab } = useUiStore();
  const [selectedRole, setSelectedRole] = useState<{ deptIdx: number; roleIdx: number } | null>(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);

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
      name: 'NewDept',
      roles: [{ name: 'lead', agentType: 'general-purpose', bound_skill: 'general-purpose' }],
    });
    saveOrg(orgId!, currentOrg);
  };

  const handleAddRole = (deptIdx: number) => {
    if (!currentOrg) return;
    currentOrg.org.departments[deptIdx].roles.push({
      name: 'new_role',
      agentType: 'general-purpose',
      bound_skill: 'general-purpose',
    });
    saveOrg(orgId!, currentOrg);
  };

  if (loading) return <div className={styles.center}>{t('Loading...')}</div>;
  if (error) return <div className={styles.center} style={{ color: 'var(--color-error)' }}>{error}</div>;
  if (!currentOrg && orgId === 'new') {
    return <NewOrgForm />;
  }
  if (!currentOrg) return <div className={styles.center}>{t('Organization not found')}</div>;

  const depts = currentOrg.org?.departments ?? [];

  return (
    <div className={styles.studio}>
      {/* Tab bar */}
      <div className={styles.tabBar}>
        <button
          className={`${styles.tab} ${editorTab === 'tree' ? styles.activeTab : ''}`}
          onClick={() => setEditorTab('tree')}
        >
          {t('Tree View')}
        </button>
        <button
          className={`${styles.tab} ${editorTab === 'canvas' ? styles.activeTab : ''}`}
          onClick={() => setEditorTab('canvas')}
        >
          {t('Canvas View')}
        </button>
        <button
          className={`${styles.tab} ${editorTab === 'workflow' ? styles.activeTab : ''}`}
          onClick={() => setEditorTab('workflow')}
        >
          🔄 Workflow
        </button>
        <div className={styles.tabActions}>
          {currentOrg && (
            <ExportMenu orgId={orgId!} orgName={currentOrg.org?.name ?? orgId!} />
          )}
          <button className={styles.runBtn} onClick={() => setRunDialogOpen(true)}>▶ {t('Run')}</button>
          <button className={styles.addBtn} onClick={handleAddDepartment}>{t('+ Department')}</button>
        </div>
      </div>

      {currentOrg && (
        <RunDialog orgId={orgId!} open={runDialogOpen} onClose={() => setRunDialogOpen(false)} />
      )}

      {/* Main content */}
      {editorTab === 'workflow' ? (
        <div className={styles.workflowContainer}>
          <WorkflowToolbar />
          <div className={styles.workflowBody}>
            <div className={styles.workflowCanvas}>
              <WorkflowCanvas
                onNodeClick={(node) => useWorkflowStore.getState().setSelectedNode(node)}
              />
            </div>
            <aside className={styles.workflowProperties}>
              <PropertiesPanel />
            </aside>
          </div>
        </div>
      ) : (
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
              <OrgCanvasView
                departments={depts}
                selectedRole={selectedRole}
                onRoleSelect={handleRoleSelect}
              />
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
      )}
    </div>
  );
}
