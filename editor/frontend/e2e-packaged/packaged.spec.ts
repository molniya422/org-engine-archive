import { test, expect, _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// The freshly packaged, unpacked exe — this is the real binary a user runs.
const EXE = 'D:\\claude-ecosystem\\org-engine\\editor\\release\\win-unpacked\\Org Engine Editor.exe';

const ORG_ID = 'packaged-org';

const ORG_YAML = `version: "2.0"
org:
  name: ${ORG_ID}
  description: "packaged-app drive"
  departments:
    - name: QA
      roles:
        - id: qa.lead
          name: lead
          agentType: general-purpose
          bound_skills: [pr-review]
budget: {}
`;

const PROPOSAL = {
  id: 'prop-pkg',
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
  rationale: 'packaged drive: dispatch_miss >= 3',
  status: 'proposed',
};

let home = '';
let learningDir = '';
let orgsDir = '';

test.beforeAll(() => {
  // Isolated runtime dirs — never touch the real ~/.org-engine-editor
  home = join(tmpdir(), `oe-pkg-${Math.random().toString(36).slice(2)}`);
  learningDir = join(home, 'learning');
  orgsDir = join(home, 'orgs');
  mkdirSync(orgsDir, { recursive: true });
  mkdirSync(join(learningDir, 'proposals'), { recursive: true });
  writeFileSync(join(orgsDir, `${ORG_ID}.yaml`), ORG_YAML);
  writeFileSync(join(learningDir, 'proposals', `${PROPOSAL.id}.json`), JSON.stringify(PROPOSAL, null, 2));
  // baseline git commit so revert can undo the apply (apply must not be root commit)
  execFileSync('git', ['init'], { cwd: orgsDir, stdio: 'ignore' });
  execFileSync('git', ['add', '.'], { cwd: orgsDir, stdio: 'ignore' });
  execFileSync('git', ['-c', 'user.name=org-engine', '-c', 'user.email=learning@org-engine', 'commit', '-m', 'baseline'], { cwd: orgsDir, stdio: 'ignore' });
});

test.afterAll(() => {
  if (home) rmSync(home, { recursive: true, force: true });
});

test('packaged app: boot → studio → evolution approve→revert', async () => {
  const app = await electron.launch({
    executablePath: EXE,
    // NOTE: do NOT pass --enable-logging — main.js opens detached DevTools for it,
    // and firstWindow() would grab the DevTools window instead of the app.
    env: { ...process.env, ORG_ENGINE_HOME: home, ORG_ENGINE_LEARNING_DIR: learningDir },
  });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

  // Home page loads and shows the seeded org card
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await expect(page.getByText(ORG_ID).first()).toBeVisible({ timeout: 15_000 });

  // Open the org → studio
  await page.getByText(ORG_ID).first().click();
  await page.waitForURL(/\/studio\//, { timeout: 15_000 });

  // Open the evolution tab
  await page.locator('button, [role=tab]').filter({ hasText: /进化/ }).first().click();
  const panel = page.getByLabel('进化面板');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('dispatch_review')).toBeVisible();

  // Approve → applied badge with commit
  await page.getByText('批准').click();
  await expect(page.getByText(/已应用 commit/)).toBeVisible({ timeout: 15_000 });

  // Revert → reverted badge (real git revert in the packaged app)
  await page.getByText('回滚').click();
  await expect(page.getByText(/已回滚/)).toBeVisible({ timeout: 15_000 });

  // Disk state: proposal reverted, org yaml reverted (no qa.r)
  const pFile = JSON.parse(readFileSync(join(learningDir, 'proposals', `${PROPOSAL.id}.json`), 'utf-8'));
  expect(pFile.status).toBe('reverted');
  const orgAfter = readFileSync(join(orgsDir, `${ORG_ID}.yaml`), 'utf-8');
  expect(orgAfter).not.toContain('qa.r');

  // No renderer errors surfaced during the whole drive
  expect(errors).toEqual([]);

  await app.close();
});

test('packaged app default config: create org via UI form + studio/workflow sweep', async () => {
  // DEFAULT learningDir (no ORG_ENGINE_LEARNING_DIR) — the real user install has no
  // learning data seeded, so the evolution panel must degrade to its empty state
  // gracefully instead of crashing. ORG_ENGINE_HOME is still isolated to avoid
  // touching the real ~/.org-engine-editor.
  const home2 = join(tmpdir(), `oe-pkg2-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(home2, 'orgs'), { recursive: true });

  const app = await electron.launch({
    executablePath: EXE,
    env: { ...process.env, ORG_ENGINE_HOME: home2 },
  });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

  // Home loads
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await expect(page.getByText('组织引擎编辑器').first().or(page.getByText(/组织/).first())).toBeVisible({ timeout: 15_000 });

  // Navigate to the create-org form via the hash router
  await page.evaluate(() => { window.location.hash = '#/studio/new'; });
  await page.waitForSelector('input[placeholder="例如：我的团队"]', { timeout: 10_000 });

  // Create the org through the real form
  const name = `pkg-ui-${Math.random().toString(36).slice(2)}`;
  await page.fill('input[placeholder="例如：我的团队"]', name);
  await page.click('button:has-text("创建组织")');
  await page.waitForURL(/\/studio\/(?!new)/, { timeout: 10_000 });
  await page.waitForSelector('button:has-text("工作流")', { timeout: 10_000 });

  // Studio tabs render
  const treeTab = page.locator('button, a, [role=tab]').filter({ hasText: /树形|Tree/ }).first();
  await expect(treeTab).toBeVisible({ timeout: 5_000 });

  // Workflow editor loads its canvas
  await page.locator('button:has-text("工作流")').first().click();
  await expect(page.locator('[data-testid="workflow-canvas"]')).toBeVisible({ timeout: 5_000 });

  // Evolution panel degrades gracefully to empty state (default config has no learning dir)
  await page.locator('button, [role=tab]').filter({ hasText: /进化/ }).first().click();
  const panel = page.getByLabel('进化面板');
  await expect(panel).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('暂无提案')).toBeVisible({ timeout: 5_000 });

  // Created org persisted to the isolated home
  const savedOrg = readFileSync(join(home2, 'orgs', `${name}.yaml`), 'utf-8');
  expect(savedOrg).toContain('org:');

  expect(errors).toEqual([]);
  await app.close();
});

test('packaged app default config uses home/learning after the path fix', async () => {
  // Regression for the packaged-app learningDir bug: with NO ORG_ENGINE_LEARNING_DIR,
  // the backend used to resolve learningDir into a non-existent app.asar-relative
  // path (resources/engine/data/learning is not shipped), so the evolution panel was
  // permanently empty and approve would 500. After the fix, the default resolves to
  // <home>/learning (writable, user-owned). Seed there, drive approve through the
  // real binary, and confirm it round-trips to disk.
  const home3 = join(tmpdir(), `oe-pkg3-${Math.random().toString(36).slice(2)}`);
  const orgs3 = join(home3, 'orgs');
  const learn3 = join(home3, 'learning'); // <-- the post-fix default target
  mkdirSync(orgs3, { recursive: true });
  mkdirSync(join(learn3, 'proposals'), { recursive: true });
  writeFileSync(join(orgs3, `${ORG_ID}.yaml`), ORG_YAML);
  writeFileSync(join(learn3, 'proposals', `${PROPOSAL.id}.json`), JSON.stringify(PROPOSAL, null, 2));
  execFileSync('git', ['init'], { cwd: orgs3, stdio: 'ignore' });
  execFileSync('git', ['add', '.'], { cwd: orgs3, stdio: 'ignore' });
  execFileSync('git', ['-c', 'user.name=org-engine', '-c', 'user.email=learning@org-engine', 'commit', '-m', 'baseline'], { cwd: orgs3, stdio: 'ignore' });

  const app = await electron.launch({
    executablePath: EXE,
    env: { ...process.env, ORG_ENGINE_HOME: home3 }, // NOTE: no ORG_ENGINE_LEARNING_DIR
  });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.getByText(ORG_ID).first().click();
  await page.waitForURL(/\/studio\//, { timeout: 15_000 });
  await page.locator('button, [role=tab]').filter({ hasText: /进化/ }).first().click();
  await expect(page.getByLabel('进化面板')).toBeVisible({ timeout: 10_000 });
  // The proposal seeded at home/learning is now visible (default path resolves correctly)
  await expect(page.getByText('dispatch_review')).toBeVisible();

  await page.getByText('批准').click();
  await expect(page.getByText(/已应用 commit/)).toBeVisible({ timeout: 15_000 });

  // Disk: proposal persisted as applied at home/learning (the fixed default path)
  const pFile = JSON.parse(readFileSync(join(learn3, 'proposals', `${PROPOSAL.id}.json`), 'utf-8'));
  expect(pFile.status).toBe('applied');
  expect(pFile.applied_commit).toMatch(/^[0-9a-f]{7,}$/);
  const orgAfter = readFileSync(join(orgs3, `${ORG_ID}.yaml`), 'utf-8');
  expect(orgAfter).toContain('qa.r');

  expect(errors).toEqual([]);
  await app.close();
});
