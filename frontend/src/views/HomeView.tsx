import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('home.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('home.subtitle')}</p>
        </div>
        <Button onClick={() => navigate('/studio/new')}>
          + {t('home.createOrg')}
        </Button>
      </div>

      {/* Active run banner */}
      {activeRun?.active && (
        <div className="flex items-center gap-4 p-4 rounded-lg border bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <span className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
          <div className="flex-1">
            <div className="font-medium text-sm">{activeRun.task}</div>
            <div className="text-xs text-muted-foreground">{activeRun.orgId}</div>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate(`/run/${activeRun.runId}`)}>
            {t('run.viewDetails')}
          </Button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
      )}

      {/* Empty state */}
      {!loading && orgs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-5xl mb-4">🏢</div>
          <h2 className="text-xl font-semibold mb-2">{t('home.emptyTitle')}</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">{t('home.emptyDesc')}</p>
          <Button onClick={() => navigate('/studio/new')}>
            + {t('home.createOrg')}
          </Button>
        </div>
      )}

      {/* Org grid */}
      {orgs.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {orgs.map((org) => (
              <Card
                key={org.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/studio/${org.id}`)}
              >
                <CardHeader>
                  <CardTitle className="text-base">{org.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">
                    {org.deptCount} departments · {org.roleCount} roles
                  </p>
                  <div className="flex gap-2">
                    <Badge variant="secondary">📁 {org.deptCount} depts</Badge>
                    <Badge variant="secondary">👤 {org.roleCount} roles</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/studio/new')}>
              <CardContent className="flex flex-col items-center py-6 text-center">
                <div className="text-2xl mb-2">➕</div>
                <p className="font-medium text-sm">{t('home.createOrg')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('home.createOrgDesc')}</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/skills')}>
              <CardContent className="flex flex-col items-center py-6 text-center">
                <div className="text-2xl mb-2">🔧</div>
                <p className="font-medium text-sm">{t('nav.skills')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('home.skillsDesc')}</p>
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer hover:shadow-md transition-shadow"
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
              <CardContent className="flex flex-col items-center py-6 text-center">
                <div className="text-2xl mb-2">📋</div>
                <p className="font-medium text-sm">{t('export.copy')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('home.exportDesc')}</p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
