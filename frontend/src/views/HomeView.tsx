import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrgStore } from '@/stores/org-store';
import styles from './HomeView.module.css';

export function HomeView() {
  const navigate = useNavigate();
  const { orgs, loading, error, fetchOrgs } = useOrgStore();

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Organizations</h1>
        <p className={styles.subtitle}>Configure and manage your organization hierarchies for multi-agent execution</p>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>Loading...</div>
      ) : (
        <div className={styles.grid}>
          {orgs.map(org => (
            <button
              key={org.id}
              className={styles.card}
              onClick={() => navigate(`/studio/${org.id}`)}
            >
              <h3 className={styles.cardTitle}>{org.name}</h3>
              <div className={styles.cardStats}>
                <span>{org.deptCount} departments</span>
                <span>{org.roleCount} roles</span>
              </div>
            </button>
          ))}

          <button className={styles.newCard} onClick={() => navigate('/studio/new')}>
            <span className={styles.newIcon}>+</span>
            <span>New Organization</span>
          </button>
        </div>
      )}
    </div>
  );
}
