import { useState } from 'react';
import styles from './SchemaViewer.module.css';

// Inline simplified schema display extracted from the JSON Schema
// In production this would fetch the schema from the backend
const SCHEMA_SECTIONS = [
  {
    title: 'Version & Metadata',
    fields: [
      { name: 'version', type: 'string', required: true, description: 'Schema version (currently "1.0")' },
      { name: 'org.name', type: 'string', required: true, description: 'Organization name' },
      { name: 'budget.max_concurrent_tasks', type: 'integer', required: false, description: 'Global concurrency limit' },
      { name: 'budget.max_cost', type: 'number', required: false, description: 'Maximum cost ceiling' },
    ],
  },
  {
    title: 'Departments',
    fields: [
      { name: 'org.departments[].name', type: 'string', required: true, description: 'Department name (unique)' },
      { name: 'org.departments[].required', type: 'boolean', required: false, description: 'Must have at least one role' },
      { name: 'org.departments[].optional', type: 'boolean', required: false, description: 'Department can be empty' },
      { name: 'org.departments[].roles[]', type: 'object', required: true, description: 'Array of role definitions' },
    ],
  },
  {
    title: 'Roles',
    fields: [
      { name: 'name', type: 'string', required: true, description: 'Role identifier (unique per dept)' },
      { name: 'agentType', type: 'string', required: true, description: 'Claude agent type to use' },
      { name: 'bound_skill', type: 'string', required: true, description: 'SKILL.md name the role executes' },
      { name: 'context_note', type: 'string', required: false, description: 'Additional context for the role' },
    ],
  },
  {
    title: 'Contracts & Manager Stages',
    fields: [
      { name: 'contracts[].name', type: 'string', required: true, description: 'Contract name' },
      { name: 'contracts[].description', type: 'string', required: true, description: 'What this contract governs' },
      { name: 'manager_stages[].gateway', type: 'string', required: true, description: 'L1, L2, or L3' },
      { name: 'manager_stages[].policy', type: 'string', required: false, description: 'Approval policy at this gateway' },
    ],
  },
  {
    title: 'Agent Types & Skills Paths',
    fields: [
      { name: 'skill_paths', type: 'string[]', required: false, description: 'Extra directories to scan for skills' },
      { name: 'agentType (built-in)', 'type': 'string', required: false, description: 'general-purpose, Explore, Plan, code-reviewer, statusline-setup' },
    ],
  },
];

export function SchemaViewer() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (title: string) => setExpanded(s => ({ ...s, [title]: !s[title] }));

  return (
    <div className={styles.viewer}>
      <p className={styles.hint}>
        The OrgConfig follows the JSON Schema at <code>schema/org-config.schema.json</code>.
        Below is a readable summary of the key fields.
      </p>

      {SCHEMA_SECTIONS.map(section => (
        <div key={section.title} className={styles.section}>
          <button className={styles.sectionHeader} onClick={() => toggle(section.title)}>
            <span className={styles.arrow}>{expanded[section.title] ? '▼' : '▶'}</span>
            <span className={styles.sectionTitle}>{section.title}</span>
          </button>

          {expanded[section.title] && (
            <div className={styles.fields}>
              {section.fields.map(field => (
                <div key={field.name} className={styles.field}>
                  <div className={styles.fieldTop}>
                    <code className={styles.fieldName}>{field.name}</code>
                    <span className={styles.fieldType}>{field.type}</span>
                    {field.required && <span className={styles.required}>required</span>}
                  </div>
                  <p className={styles.fieldDesc}>{field.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
