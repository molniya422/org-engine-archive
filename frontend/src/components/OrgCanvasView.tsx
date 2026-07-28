import styles from './OrgCanvasView.module.css';

interface Department { name: string; roles: { name: string; agentType: string; bound_skill: string }[] }

interface OrgCanvasViewProps { departments: Department[] }

export function OrgCanvasView({ departments }: OrgCanvasViewProps) {
  return (
    <div className={styles.canvas}>
      <p className={styles.hint}>Canvas View — drag roles and departments visually.</p>
      <div className={styles.nodeList}>
        {departments.map((dept, i) => (
          <div key={i} className={styles.node}>
            <strong>{dept.name}</strong>
            <span className={styles.count}>{dept.roles.length} roles</span>
          </div>
        ))}
      </div>
    </div>
  );
}
