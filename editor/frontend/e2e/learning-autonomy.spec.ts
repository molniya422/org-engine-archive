import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { E2E_HOME, E2E_LEARNING, E2E_ORGS } from './learning-env';

const ORG_ID = 'auto-org';

const ORG_YAML = `version: "2.0"
org:
  name: ${ORG_ID}
  departments:
    - name: FE
      roles:
        - id: fe.builder
          name: builder
          agentType: general-purpose
          bound_skills: [dpa]
  contracts: []
budget: {}
learning:
  autonomy: l3
`;

const PROPOSAL = {
  id: 'prop-auto',
  org_ref: ORG_ID,
  rule: 'skill_rebind',
  changes: [{ op: 'rebind_skill', skill: 'dpa', target: 'redesign-skill' }],
  evidence: [{}, {}, {}],
  rationale: 'auto-apply e2e',
  status: 'proposed',
};

test.beforeAll(() => {
  rmSync(E2E_HOME, { recursive: true, force: true });
  mkdirSync(E2E_ORGS, { recursive: true });
  mkdirSync(join(E2E_LEARNING, 'proposals'), { recursive: true });
  writeFileSync(join(E2E_ORGS, `${ORG_ID}.yaml`), ORG_YAML);
  writeFileSync(join(E2E_LEARNING, 'proposals', `${PROPOSAL.id}.json`), JSON.stringify(PROPOSAL, null, 2));
});

test.afterAll(() => {
  rmSync(E2E_HOME, { recursive: true, force: true });
});

test('l3 org auto-applies a low-risk rebind proposal', async ({ page }) => {
  const res = await page.request.post('/api/learning/proposals/auto-apply');
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.applied).toBe(1);

  const org = readFileSync(join(E2E_ORGS, `${ORG_ID}.yaml`), 'utf-8');
  expect(org).toContain('redesign-skill');
  expect(org).not.toContain('bound_skills: [dpa]');   // 旧绑定已被替换

  const applied = JSON.parse(readFileSync(join(E2E_LEARNING, 'proposals', `${PROPOSAL.id}.json`), 'utf-8'));
  expect(applied.status).toBe('applied');
  expect(applied.auto_applied).toBe(true);
  expect(applied.applied_commit).toMatch(/^[0-9a-f]{7,}$/);
});
