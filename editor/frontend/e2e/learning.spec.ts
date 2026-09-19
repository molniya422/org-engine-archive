import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { E2E_HOME, E2E_LEARNING, E2E_ORGS } from './learning-env';

const ORG_ID = 'default-org';

const ORG_YAML = `version: "2.0"
org:
  name: ${ORG_ID}
  description: "e2e learning-loop seed"
  departments:
    - name: QA
      roles:
        - id: qa.lead
          name: lead
          agentType: general-purpose
          bound_skills: [pr-review]
budget:
  max_depth: 3
  max_cycles_per_layer: 3
  max_executors_per_department: 6
  max_parallel_agents: 8
  gateway_timeout_minutes: 60
`;

const PROPOSAL = {
  id: 'prop-e2e',
  org_ref: ORG_ID,
  rule: 'dispatch_review',
  changes: [
    {
      op: 'add_role',
      dept: 'QA',
      role: { id: 'qa.r', name: 'r', agentType: 'general-purpose', bound_skills: ['pr-review'] },
    },
  ],
  evidence: [{}, {}, {}],
  rationale: 'e2e seed: dispatch_miss ≥ 3',
  status: 'proposed',
};

test.beforeAll(() => {
  // 每次跑前清空隔离目录,避免上一轮的 applied 状态污染断言
  rmSync(E2E_HOME, { recursive: true, force: true });
  mkdirSync(E2E_ORGS, { recursive: true });
  mkdirSync(join(E2E_LEARNING, 'proposals'), { recursive: true });
  writeFileSync(join(E2E_ORGS, `${ORG_ID}.yaml`), ORG_YAML);
  writeFileSync(join(E2E_LEARNING, 'events.jsonl'),
    JSON.stringify({ ts: '2026-09-11T00:00:00+00:00', run_id: 'r', kind: 'dispatch_miss', payload: {} }) + '\n');
  writeFileSync(join(E2E_LEARNING, 'proposals', `${PROPOSAL.id}.json`), JSON.stringify(PROPOSAL, null, 2));
});

test.afterAll(() => {
  rmSync(E2E_HOME, { recursive: true, force: true });
});

test('approve proposal mutates org yaml and records a commit', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByText(ORG_ID).first().click();
  await page.waitForURL(/\/studio\//, { timeout: 5_000 });

  // 打开「进化」标签页
  await page.locator('button, [role=tab]').filter({ hasText: /进化/ }).first().click();

  const panel = page.getByLabel('进化面板');
  await expect(panel).toBeVisible();
  await expect(page.getByText('dispatch_review')).toBeVisible();
  await expect(page.getByText('证据 3 条')).toBeVisible();

  await page.getByText('批准').click();
  await expect(page.getByText(/已应用 commit/)).toBeVisible({ timeout: 10_000 });

  // 提案文件落盘为 applied,且带 7+ 位 commit
  const applied = JSON.parse(
    readFileSync(join(E2E_LEARNING, 'proposals', `${PROPOSAL.id}.json`), 'utf-8'),
  );
  expect(applied.status).toBe('applied');
  expect(applied.applied_commit).toMatch(/^[0-9a-f]{7,}$/);

  // org yaml 真的写入了新角色
  const org = readFileSync(join(E2E_ORGS, `${ORG_ID}.yaml`), 'utf-8');
  expect(org).toContain('qa.r');
});