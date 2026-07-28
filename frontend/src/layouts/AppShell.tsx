import { Outlet, NavLink } from 'react-router-dom';
import { t } from '@/i18n';
import styles from './AppShell.module.css';

export function AppShell() {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>⚙ OrgEngine</div>
        <nav className={styles.nav}>
          <NavLink to="/" end className={({ isActive }) => isActive ? styles.active : ''}>
            🏠 {t('nav.home')}
          </NavLink>
          <NavLink to="/skills" className={({ isActive }) => isActive ? styles.active : ''}>
            🔧 {t('nav.skills')}
          </NavLink>
        </nav>
        <div className={styles.sidebarFooter}>
          <button className={styles.settingsBtn} title={t('nav.settings')}>
            ⚙️
          </button>
          <span className={styles.mcpBadge} title="MCP available on stdio">MCP</span>
        </div>
      </aside>
      <main className={styles.main}>
        <div className={styles.toolbar}>
          <span className={styles.toolbarTitle}>{'组织引擎编辑器'}</span>
        </div>
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
