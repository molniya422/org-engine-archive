import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { t } from '@/i18n';
import styles from './StudioView.module.css';
export function StudioView() {
    const { orgId } = useParams();
    const { currentOrg, loading, error, loadOrg, saveOrg } = useOrgStore();
    const { editorTab, setEditorTab } = useUiStore();
    const [selectedRole, setSelectedRole] = useState(null);
    const [runDialogOpen, setRunDialogOpen] = useState(false);
    useEffect(() => {
        if (orgId && orgId !== 'new')
            loadOrg(orgId);
    }, [orgId, loadOrg]);
    const handleRoleSelect = (deptIdx, roleIdx) => {
        setSelectedRole({ deptIdx, roleIdx });
    };
    const handleRoleUpdate = (updatedRole) => {
        if (!currentOrg || !selectedRole)
            return;
        const dept = currentOrg.org.departments[selectedRole.deptIdx];
        if (dept) {
            dept.roles[selectedRole.roleIdx] = updatedRole;
            saveOrg(orgId, currentOrg);
        }
    };
    const handleAddDepartment = () => {
        if (!currentOrg)
            return;
        currentOrg.org.departments.push({
            name: 'NewDept',
            roles: [{ name: 'lead', agentType: 'general-purpose', bound_skill: 'general-purpose' }],
        });
        saveOrg(orgId, currentOrg);
    };
    const handleAddRole = (deptIdx) => {
        if (!currentOrg)
            return;
        currentOrg.org.departments[deptIdx].roles.push({
            name: 'new_role',
            agentType: 'general-purpose',
            bound_skill: 'general-purpose',
        });
        saveOrg(orgId, currentOrg);
    };
    if (loading)
        return _jsx("div", { className: styles.center, children: t('Loading...') });
    if (error)
        return _jsx("div", { className: styles.center, style: { color: 'var(--color-error)' }, children: error });
    if (!currentOrg && orgId === 'new') {
        return _jsx(NewOrgForm, {});
    }
    if (!currentOrg)
        return _jsx("div", { className: styles.center, children: t('Organization not found') });
    const depts = currentOrg.org?.departments ?? [];
    return (_jsxs("div", { className: styles.studio, children: [_jsxs("div", { className: styles.tabBar, children: [_jsx("button", { className: `${styles.tab} ${editorTab === 'tree' ? styles.activeTab : ''}`, onClick: () => setEditorTab('tree'), children: t('Tree View') }), _jsx("button", { className: `${styles.tab} ${editorTab === 'canvas' ? styles.activeTab : ''}`, onClick: () => setEditorTab('canvas'), children: t('Canvas View') }), _jsxs("div", { className: styles.tabActions, children: [currentOrg && (_jsx(ExportMenu, { orgId: orgId, orgName: currentOrg.org?.name ?? orgId })), _jsxs("button", { className: styles.runBtn, onClick: () => setRunDialogOpen(true), children: ["\u25B6 ", t('Run')] }), _jsx("button", { className: styles.addBtn, onClick: handleAddDepartment, children: t('+ Department') })] })] }), currentOrg && (_jsx(RunDialog, { orgId: orgId, open: runDialogOpen, onClose: () => setRunDialogOpen(false) })), _jsxs("div", { className: styles.content, children: [_jsx("div", { className: styles.panel, children: editorTab === 'tree' ? (_jsx(OrgTreeView, { departments: depts, selectedRole: selectedRole, onRoleSelect: handleRoleSelect, onAddRole: handleAddRole })) : (_jsx(OrgCanvasView, { departments: depts, selectedRole: selectedRole, onRoleSelect: handleRoleSelect })) }), _jsx("aside", { className: styles.editor, children: _jsx(RoleEditor, { selectedRole: selectedRole, departments: depts, onUpdate: handleRoleUpdate }) })] })] }));
}
