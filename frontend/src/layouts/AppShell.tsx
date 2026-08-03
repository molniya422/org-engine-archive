'use client';

import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useThemeStore } from '@/stores/theme-store';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
import {
  LayoutDashboard,
  Grid3x3,
  Cpu,
  SwatchBook,
  Sun,
  Moon,
  Settings2,
  ChevronRight,
  ShieldCheck,
  ArrowLeft,
  CalendarDays,
  Radar,
} from 'lucide-react';

/**
 * AppShell — Exhibition-pedestal layout.
 *
 * Structure:
 *   [Glass sidebar rail left] [Main content]
 *
 * Sidebar rail:
 *   - Narrow (56px expanded → 200px on hover), machined-chrome finish
 *   - Top: brand mark (mono small)
 *   - Center: nav icons + label on hover
 *   - Bottom: theme toggle + MCP badge + settings
 *
 * Content:
 *   - Full-height scrollable
 *   - Thin chrome toolbar at top with current view label
 *   - Outlet renders below
 *
 * Dials: VARIANCE=9, MOTION=7, DENSITY=5
 */
export function AppShell() {
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const location = useLocation();

  // 全局返回：非首页时在顶部工具栏显示「←」，导航到上一级路由
  // （/skills → /，/studio/abc/runs/x → /studio/abc，/studio/abc → /）
  const pathname = location.pathname;
  const segments = pathname.split('/').filter(Boolean);
  const isHome = pathname === '/';
  const goBack = () => {
    if (isHome) return;
    if (segments.length > 1) navigate('/' + segments.slice(0, -1).join('/'));
    else navigate('/');
  };

  const navItems = [
    { to: '/', end: true, icon: LayoutDashboard, label: t('nav.home') },
    { to: '/templates', end: false, icon: SwatchBook, label: t('Playbooks') },
    { to: '/skills', end: false, icon: Cpu, label: t('nav.skills') },
    { to: '/meetings', end: false, icon: CalendarDays, label: '会议记录' },
    { to: '/comm', end: false, icon: Radar, label: '通信审计' },
  ];

  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-background">
      {/* ── Sidebar ── */}
      <nav className="group/sidebar flex flex-col w-14 hover:w-[180px] transition-all duration-300 ease-out shrink-0 border-r border-border chrome-hairline bg-card z-20">
        {/* Brand mark */}
        <div className="flex items-center h-12 px-3 border-b border-border">
          <span className="font-mono text-xs tracking-[0.18em] text-accent uppercase whitespace-nowrap">
            <span className="inline-block w-5">OE</span>
            <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200 ml-2">
              编辑器
            </span>
          </span>
        </div>

        {/* Navigation */}
        <div className="flex-1 flex flex-col gap-1 py-3 px-2">
          {navItems.map(({ to, end, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 h-9 px-2 rounded-sm text-[13px] font-medium whitespace-nowrap overflow-hidden transition-colors duration-150 ${
                  isActive
                    ? 'bg-accent/10 text-accent border-l-2 border-accent -ml-px'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`
              }
            >
              <Icon size={18} className="shrink-0" />
              <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200">
                {label}
              </span>
            </NavLink>
          ))}
        </div>

        {/* Bottom: theme + meta */}
        <div className="flex flex-col gap-1 p-2 border-t border-border">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 h-9 px-2 rounded-sm text-muted-foreground hover:text-foreground hover:bg-secondary text-[13px] transition-colors duration-150 whitespace-nowrap"
            title={theme === 'dark' ? t('theme.light') : t('theme.dark')}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200">
              {theme === 'dark' ? '浅色' : '深色'}
            </span>
          </button>

          <button
            onClick={() => navigate('/health')}
            className="flex items-center gap-3 h-9 px-2 rounded-sm text-muted-foreground hover:text-foreground hover:bg-secondary text-[13px] transition-colors duration-150 whitespace-nowrap"
            title="诊断"
          >
            <ShieldCheck size={17} />
            <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200">
              诊断
           </span>
         </button>

          <div className="flex items-center gap-3 h-9 px-2 rounded-sm whitespace-nowrap">
            <span className="inline-block w-[7px] h-[7px] rounded-full bg-emerald-400 shrink-0" />
            <span className="font-mono text-[10.5px] tracking-[0.06em] text-emerald-400 opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200">
              MCP 已连接
            </span>
          </div>
        </div>
      </nav>

      {/* ── Main Zone ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chrome toolbar */}
        <header className="flex items-center h-11 px-4 border-b border-border chrome-hairline bg-background/95 backdrop-blur-lg z-10 gap-2">
          {!isHome && (
            <Button variant="ghost" size="icon" onClick={goBack} title="返回" className="h-8 w-8 -ml-1">
              <ArrowLeft size={15} />
            </Button>
          )}
          <Settings2 size={14} className="text-muted-foreground" />
          <span className="font-mono text-[11px] tracking-[0.04em] text-muted-foreground uppercase">
            组织引擎编辑器
          </span>

          <div className="flex-1" />

          <div className="flex items-center gap-2 text-[10.5px] font-mono text-muted-foreground">
            <span className="hidden sm:inline">v0.1.0</span>
            <span className="hidden sm:inline text-border">|</span>
            <span>
              {new Intl.DateTimeFormat('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date())}
            </span>
          </div>
        </header>

        {/* Page content — min-h-0 so nested h-full / ReactFlow get a real height */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
