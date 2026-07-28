import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrgStore } from '@/stores/org-store';
import { api } from '@/api/client';
import { t } from '@/i18n';
import styles from './HomeView.module.css';

interface ActiveRun {
  runId: string;
  status: string;
  orgId: string;
  task: string;
}

export function HomeView() {
  const navigate = useNavigate();
  const { orgs, loading, error, fetchOrgs } = useOrgStore();
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  useEffect(() => {
    const check = async () => {
      try {
        const data = await api.getActiveRun();
        if (data && data.active !== false) setActiveRun(data);
        else setActiveRun(null);
      } catch { setActiveRun(null); }
    };
    check();
    const iv = setInterval(check, 5000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('Organizations')}</h1>
        <p className={styles.subtitle}>{t('Configure and manage your organization hierarchies for multi-agent execution')}</p>
      </header>

      {activeRun && (
        <div className={styles.activeRunBanner}>
          <span className={styles.runIndicator} />
          <span>
            <strong>{activeRun.status === 'awaiting_user' ? '等待决策' : '正在运行'}</strong>
            ：{activeRun.task} — <button className={styles.runLink} onClick={() => navigate(`/studio/${activeRun.orgId}/runs/${activeRun.runId}`)}>查看详情</button>
          </span>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>{t('Loading...')}</div>
      ) : (
        <div className={styles.grid}>
          {orgs.map(org => (
            <button
              key={org.id}
              className={styles.card}
              onClick={() => navigate(`/studio/${org.id}`)}
            >
              <h3 className={styles.cardTitle}>
                {org.name}
                {activeRun?.orgId === org.id && (
                  <span className={styles.orgRunBadge}>
                    {activeRun.status === 'awaiting_user' ? '等待' : '运行中'}
                  </span>
                )}
              </h3>
              <div className={styles.cardStats}>
                <span>{org.deptCount}{t('departments')}</span>
                <span>{org.roleCount}{t('roles')}</span>
              </div>
            </button>
          ))}

          <button className={styles.newCard} onClick={() => navigate('/studio/new')}>
            <span className={styles.newIcon}>+</span>
            <span>{t('New Organization')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
