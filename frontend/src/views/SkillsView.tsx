import { useEffect, useState } from 'react';
import { useSkillsStore } from '@/stores/skills-store';
import { SchemaViewer } from '@/components/SchemaViewer';
import styles from './SkillsView.module.css';

export function SkillsView() {
  const { skills, loading, error, fetchSkills, scanSkills } = useSkillsStore();
  const [tab, setTab] = useState<'skills' | 'schema'>('skills');
  const [extraPath, setExtraPath] = useState('');

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Skills & Schema</h1>
      </header>

      <div className={styles.tabBar}>
        <button className={`${styles.tab} ${tab === 'skills' ? styles.activeTab : ''}`} onClick={() => setTab('skills')}>
          Skills ({skills.length})
        </button>
        <button className={`${styles.tab} ${tab === 'schema' ? styles.activeTab : ''}`} onClick={() => setTab('schema')}>
          Schema
        </button>
      </div>

      {tab === 'skills' ? (
        <div className={styles.skillsPanel}>
          <div className={styles.toolbar}>
            <input
              className={styles.pathInput}
              placeholder="Extra scan path (optional)"
              value={extraPath}
              onChange={e => setExtraPath(e.target.value)}
            />
            <button className={styles.scanBtn} onClick={() => scanSkills(extraPath ? [extraPath] : undefined)}>
              {loading ? 'Scanning...' : 'Rescan'}
            </button>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          {loading ? (
            <p className={styles.loading}>Scanning skills...</p>
          ) : skills.length === 0 ? (
            <p className={styles.empty}>No skills found. Trigger a scan to discover available skills.</p>
          ) : (
            <div className={styles.list}>
              {skills.map((skill, i) => (
                <div key={i} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <span className={styles.skillName}>{skill.name}</span>
                    <span className={`${styles.source} ${skill.source === 'skill' ? styles.sourceSkill : styles.sourceType}`}>
                      {skill.source}
                    </span>
                  </div>
                  <p className={styles.skillDesc}>{skill.description}</p>
                  {skill.path && <span className={styles.skillPath}>{skill.path}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <SchemaViewer />
      )}
    </div>
  );
}
