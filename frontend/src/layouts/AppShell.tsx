import { Outlet, NavLink } from 'react-router-dom';
import styles from './AppShell.module.css';

export function AppShell() {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>OrgEngine</div>
        <nav className={styles.nav}>
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/skills">Skills</NavLink>
        </nav>
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
