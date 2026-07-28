import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { t } from '../i18n';
import styles from './HomeView.module.css';

interface OrgSummary {
  id: string;
  name: string;
  deptCount: number;
  roleCount: number;
}

interface ActiveRun {
  active: boolean;
  runId?: string;
  orgId?: string;
  task?: string;
}

export function HomeView() {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);

  useEffect(() => {
    loadOrgs();
    checkActiveRun();
    const interval = setInterval(checkActiveRun, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadOrgs() {
    try {
      const list = await api.listOrgs();
      setOrgs(list);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function checkActiveRun() {
    try {
      const run = await api.getActiveRun();
      setActiveRun(run);
    } catch { /* ignore */ }
  }

  return (
    <div className={styles.homeContainer}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div>
            <h1 className={styles.headerTitle}>{t('home.title')}</h1>
            <p className={styles.headerSubtitle}>{t('home.subtitle')}</p>
          </div>
        </div>
        <div className={styles.toolbar}>
          <button className={styles.createBtn} onClick={() => navigate('/studio/new')}>
            + {t('home.createOrg')}
          </button>
        </div>
      </div>

      {/* Active run banner */}
      {activeRun?.active && (
        <div className={styles.runBanner}>
          <div className={styles.runDot} />
          <div className={styles.runInfo}>
            <div className={styles.runTitle}>{activeRun.task}</div>
            <div className={styles.runOrg}>{activeRun.orgId}</div>
          </div>
          <button
            className={styles.viewRunBtn}
            onClick={() => navigate(`/run/${activeRun.runId}`)}
          >
            {t('run.viewDetails')}
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className={styles.emptyState}>
          <p>{t('common.loading')}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && orgs.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🏢</div>
          <h2 className={styles.emptyTitle}>{t('home.emptyTitle')}</h2>
          <p className={styles.emptyDesc}>{t('home.emptyDesc')}</p>
          <button className={styles.createBtn} onClick={() => navigate('/studio/new')}>
            + {t('home.createOrg')}
          </button>
        </div>
      )}

      {/* Org grid */}
      {orgs.length > 0 && (
        <>
          <div className={styles.orgGrid}>
            {orgs.map((org) => (
              <div
                key={org.id}
                className={styles.orgCard}
                onClick={() => navigate(`/studio/${org.id}`)}
              >
                <h3 className={styles.orgName}>{org.name}</h3>
                <p className={styles.orgMeta}>
                  {org.deptCount} departments · {org.roleCount} roles
                </p>
                <div className={styles.orgBadges}>
                  <span className={styles.badge}>
                    📁 {org.deptCount} depts
                  </span>
                  <span className={styles.badge}>
                    👤 {org.roleCount} roles
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className={styles.quickActions}>
            <div className={styles.actionCard} onClick={() => navigate('/studio/new')}>
              <div className={styles.actionIcon}>➕</div>
              <p className={styles.actionLabel}>{t('home.createOrg')}</p>
              <p className={styles.actionDesc}>{t('home.createOrgDesc')}</p>
            </div>
            <div className={styles.actionCard} onClick={() => navigate('/skills')}>
              <div className={styles.actionIcon}>🔧</div>
              <p className={styles.actionLabel}>{t('nav.skills')}</p>
              <p className={styles.actionDesc}>{t('home.skillsDesc')}</p>
            </div>
            <div
              className={styles.actionCard}
              onClick={async () => {
                if (orgs.length > 0) {
                  try {
                    const yaml = await api.exportOrg(orgs[0].id, 'yaml');
                    await navigator.clipboard.writeText(yaml);
                    alert(t('export.copied'));
                  } catch { /* ignore */ }
                }
              }}
            >
              <div className={styles.actionIcon}>📋</div>
              <p className={styles.actionLabel}>{t('export.copy')}</p>
              <p className={styles.actionDesc}>{t('home.exportDesc')}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
