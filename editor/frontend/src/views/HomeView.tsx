'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { GlassLens } from '@/components/showcase/GlassLens';
import { api } from '../api/client';
import { t } from '../i18n';
import {
  Plus, Layers, Wrench, ClipboardCopy, ArrowUpRight, Activity,
  RefreshCw, ShieldCheck, Server, CheckCircle, XCircle, AlertTriangle, Trash2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { useOrgStore } from '@/stores/org-store';
import { toast } from '@/stores/toast-store';

interface OrgSummary { id: string; name: string; deptCount: number; roleCount: number; }
interface ActiveRun { active: boolean; runId?: string; orgId?: string; task?: string; }

export function HomeView() {
  const navigate = useNavigate();
  const deleteOrg = useOrgStore((s) => s.deleteOrg);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [rescanning, setRescanning] = useState(false);
  const [rescanMsg, setRescanMsg] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrgSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadOrgs();
    checkActiveRun();
    loadHealth();
    const interval = setInterval(checkActiveRun, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadOrgs() {
    try {
      const list = await api.listOrgs();
      setOrgs(list);
    } catch (e) {
      console.error('[home] listOrgs failed', e);
    }
    setLoading(false);
  }

  async function checkActiveRun() {
    try {
      const run = await api.getActiveRun();
      setActiveRun(run);
    } catch (e) {
      console.error('[home] getActiveRun failed', e);
    }
  }

  async function loadHealth() {
    try {
      const h = await api.getHealth();
      setHealth(h);
    } catch (e) {
      console.error('[home] getHealth failed', e);
    }
  }

  async function rescanSkills() {
    setRescanning(true); setRescanMsg(null);
    try {
      const list = await api.scanSkills();
      setRescanMsg(`已扫描 ${list.length} 个技能`);
      setTimeout(() => setRescanMsg(null), 2500);
    } catch {
      setRescanMsg('扫描失败');
    } finally {
      setRescanning(false);
    }
  }

  async function handleDeleteOrg() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteOrg(deleteTarget.id);
      setOrgs((prev) => prev.filter((o) => o.id !== deleteTarget.id));
      toast.success(`已删除组织：${deleteTarget.name}`);
    } catch (e: any) {
      toast.error(e?.message ?? '删除失败');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const fadeUp = (d: number) => ({
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.55, delay: d, ease: [0.16, 1, 0.3, 1] as const },
  });

  return (
    <div className="h-full overflow-y-auto flex flex-col" data-testid="home-scroll-container">
      {/* Hero */}
      <section className="relative grid grid-cols-1 lg:grid-cols-2 min-h-[75dvh]">
        <motion.div className="flex flex-col justify-center px-8 py-16 lg:py-0 lg:pl-12 xl:pl-16 z-10" {...fadeUp(0)}>
          <span className="tracking-label mb-4">组织引擎</span>
          <h1 className="font-display text-[clamp(2rem,5vw,3.5rem)] font-semibold tracking-[-0.03em] leading-[1.08] text-foreground max-w-[16ch]">
            精密配置<br /><span className="text-accent">多智能体协作</span>
          </h1>
          <p className="mt-5 text-[14.5px] leading-relaxed text-muted-foreground max-w-[50ch]">{t('home.subtitle')}</p>
          <div className="flex items-center gap-3 mt-8">
            <Button variant="accent" size="lg" onClick={() => navigate('/studio/new')}><Plus size={16} />{t('home.createOrg')}</Button>
            <Button variant="outline" size="lg" onClick={() => navigate('/templates')}><Layers size={16} />从模板创建</Button>
          </div>
        </motion.div>
        <motion.div className="relative flex items-center justify-center p-6 lg:p-0" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}>
          <div className="relative w-full max-w-[520px] aspect-[4/3]"><GlassLens className="w-full h-full rounded-xl" /></div>
        </motion.div>
      </section>

      <div className="px-8 lg:px-16"><div className="pedestal-strip" /></div>

      {/* Active Run */}
      {activeRun?.active && (
        <section className="px-8 lg:px-16 mt-6">
          <motion.div className="glass-panel rounded-md p-4 flex items-center gap-4" {...fadeUp(0.25)}>
            <Activity size={18} className="text-accent animate-pulse shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[12.5px] text-foreground truncate">{activeRun.task}</div>
              <div className="font-mono text-[10.5px] text-muted-foreground">{activeRun.orgId}</div>
            </div>
            <Badge variant="accent">运行中</Badge>
            <Button size="sm" variant="outline" onClick={() => navigate(`/studio/${activeRun.orgId}/runs/${activeRun.runId}`)}><ArrowUpRight size={14} />{t('run.viewDetails')}</Button>
          </motion.div>
        </section>
      )}

      {/* Loading */}
      {loading && (
        <section className="px-8 lg:px-16 mt-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3].map((i) => <Skeleton key={i} className="h-28 rounded-md" />)}
          </div>
        </section>
      )}

      {/* Empty */}
      {!loading && orgs.length === 0 && (
        <section className="flex-1 flex items-center justify-center px-8 py-16">
          <motion.div className="flex flex-col items-center text-center max-w-sm" {...fadeUp(0.3)}>
            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mb-5"><Layers size={22} className="text-muted-foreground" /></div>
            <h2 className="font-display text-xl font-medium tracking-[-0.01em] mb-2">{t('home.emptyTitle')}</h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed mb-6">{t('home.emptyDesc')}</p>
            <Button variant="accent" onClick={() => navigate('/studio/new')}><Plus size={16} />{t('home.createOrg')}</Button>
          </motion.div>
        </section>
      )}

      {/* Org Grid */}
      {orgs.length > 0 && (
        <section className="px-8 lg:px-16 mt-10 mb-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-base font-medium tracking-[-0.01em] text-foreground">{t('Organizations')}</h2>
            <Badge variant="muted" className="mono-num">{orgs.length}</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {orgs.map((org, i) => (
              <motion.div key={org.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.08 * i, ease: [0.16, 1, 0.3, 1] }}>
                <Card variant="flat" className="cursor-pointer group hover:border-accent/40 transition-colors duration-200" onClick={() => navigate(`/studio/${org.id}`)}>
                  <CardContent className="flex flex-col gap-2 pt-5">
                    <div className="flex items-center justify-between">
                      <CardTitle>{org.name}</CardTitle>
                      <div className="flex items-center gap-1.5 -mt-1">
                        <button
                          aria-label={`删除组织 ${org.name}`}
                          title="删除组织"
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1 rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(org);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                        <ArrowUpRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="mono-num text-sm text-muted-foreground">{org.deptCount}<span className="text-[10.5px] font-mono text-muted-foreground ml-1">部门</span></span>
                      <span className="mono-num text-sm text-muted-foreground">{org.roleCount}<span className="text-[10.5px] font-mono text-muted-foreground ml-1">角色</span></span>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="muted">{org.deptCount} 个部门</Badge>
                      <Badge variant="muted">{org.roleCount} 个角色</Badge>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Quick Actions — 5 cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mt-8">
            {/* Create Org */}
            <Card variant="glass" className="cursor-pointer group hover:border-accent/40 transition-colors duration-200" onClick={() => navigate('/studio/new')}>
              <CardContent className="flex flex-col items-center py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center mb-4"><Plus size={18} className="text-accent" /></div>
                <p className="font-medium text-[13px]">{t('home.createOrg')}</p>
                <p className="text-[12px] text-muted-foreground mt-1 px-4">{t('home.createOrgDesc')}</p>
              </CardContent>
            </Card>

            {/* From Template */}
            <Card variant="glass" className="cursor-pointer group hover:border-accent/40 transition-colors duration-200" onClick={() => navigate('/templates')}>
              <CardContent className="flex flex-col items-center py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center mb-4"><Layers size={18} className="text-accent" /></div>
                <p className="font-medium text-[13px]">从模板创建</p>
                <p className="text-[12px] text-muted-foreground mt-1 px-4">应用剧本</p>
              </CardContent>
            </Card>

            {/* Skills */}
            <Card variant="glass" className="cursor-pointer group hover:border-accent/40 transition-colors duration-200" onClick={() => navigate('/skills')}>
              <CardContent className="flex flex-col items-center py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center mb-4"><Wrench size={18} className="text-accent" /></div>
                <p className="font-medium text-[13px]">{t('nav.skills')}</p>
                <p className="text-[12px] text-muted-foreground mt-1 px-4">{t('home.skillsDesc')}</p>
              </CardContent>
            </Card>

            {/* Rescan Skills */}
            <Card variant="glass" className={`cursor-pointer group hover:border-accent/40 transition-colors duration-200 ${rescanning ? 'opacity-60 pointer-events-none' : ''}`} onClick={rescanSkills}>
              <CardContent className="flex flex-col items-center py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center mb-4">
                  <RefreshCw size={18} className={`text-accent ${rescanning ? 'animate-spin' : ''}`} />
                </div>
                <p className="font-medium text-[13px]">{rescanning ? '扫描中…' : rescanMsg ?? '重新扫描技能'}</p>
                <p className="text-[12px] text-muted-foreground mt-1 px-4">刷新技能池</p>
              </CardContent>
            </Card>

            {/* Export */}
            <Card variant="glass" className="cursor-pointer group hover:border-accent/40 transition-colors duration-200" onClick={async () => {
              if (orgs.length > 0) {
                try { const y = await api.exportOrg(orgs[0].id, 'yaml'); await navigator.clipboard.writeText(y); alert(t('export.copied')); } catch { /* ignore */ }
              }
            }}>
              <CardContent className="flex flex-col items-center py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center mb-4"><ClipboardCopy size={18} className="text-accent" /></div>
                <p className="font-medium text-[13px]">{t('export.copy')}</p>
                <p className="text-[12px] text-muted-foreground mt-1 px-4">{t('home.exportDesc')}</p>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Health Footer */}
      {health && (
        <footer className="px-8 lg:px-16 py-6 mt-4 border-t border-border">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <ShieldCheck size={14} className="text-muted-foreground" />
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">系统</span>
              <Badge variant={(health.backend === 'ok' && health.schema.available && health.harness.available) ? 'muted' : 'outline'} className="text-[10px]">
                {(health.backend === 'ok' && health.schema.available && health.harness.available)
                  ? <><CheckCircle size={10} className="mr-1" /> 就绪</>
                  : <><AlertTriangle size={10} className="mr-1" /> 问题</>
                }
              </Badge>
            </div>
            <div className="flex items-center gap-5 text-[11px] font-mono text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Server size={11} /> 后端
                {health.backend === 'ok' ? <CheckCircle size={10} className="text-emerald-400" /> : <XCircle size={10} className="text-destructive" />}
              </span>
              <span className="flex items-center gap-1.5"><Layers size={11} /> {health.playbookCount} 个剧本</span>
              <span className="flex items-center gap-1.5">
                Schema {health.schema.available ? <CheckCircle size={10} className="text-emerald-400" /> : <XCircle size={10} className="text-amber-400" />}
              </span>
              <span className="flex items-center gap-1.5">
                适配器 {health.harness.available ? <CheckCircle size={10} className="text-emerald-400" /> : <XCircle size={10} className="text-amber-400" />}
              </span>
              <Button size="sm" variant="ghost" onClick={() => navigate('/health')}>诊断 <ArrowUpRight size={11} /></Button>
            </div>
          </div>
        </footer>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>删除组织</DialogTitle>
            <DialogDescription>
              确定要删除组织「{deleteTarget?.name}」吗？此操作不可撤销，将同时删除该组织的配置数据。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={deleting}>取消</Button>
            </DialogClose>
            <Button
              variant="danger"
              disabled={deleting}
              onClick={handleDeleteOrg}
              data-testid="confirm-delete-org"
            >
              {deleting ? '删除中…' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}