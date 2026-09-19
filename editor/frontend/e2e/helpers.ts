import { test as base, expect, type APIRequestContext } from '@playwright/test';

/** Valid org config that passes v2.0 schema validation (pure role registry). */
export function makeOrg(name: string): unknown {
  return {
    version: '2.0',
    org: {
      name,
      description: 'E2E test org',
      departments: [
        {
          name: 'Engineering',
          description: 'Engineering dept',
          roles: [
            {
              id: 'engineering.developer',
              name: 'developer',
              description: 'Software developer',
              agentType: 'general-purpose',
              bound_skills: ['coding'],
            },
          ],
        },
      ],
    },
    budget: {
      max_depth: 3,
      max_cycles_per_layer: 3,
      max_executors_per_department: 6,
      max_parallel_agents: 8,
      gateway_timeout_minutes: 60,
    },
  };
}

/** Create a test org via the API, returning its name. */
export async function createTestOrg(
  request: APIRequestContext,
  suffix?: string,
): Promise<string> {
  const name = `e2e-${suffix ?? Date.now()}`;
  const resp = await request.put(`/api/v1/orgs/${name}`, { data: makeOrg(name) });
  if (!resp.ok()) throw new Error(`Create org failed: ${await resp.text()}`);
  return name;
}

/** Delete a test org via the API. */
export async function deleteTestOrg(
  request: APIRequestContext,
  name: string,
): Promise<void> {
  await request.delete(`/api/v1/orgs/${name}`);
}

/** Navigate to home and wait for org list to load. */
export async function goHome(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}
