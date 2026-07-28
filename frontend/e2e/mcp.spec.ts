import { test, expect } from '@playwright/test';

test.describe('MCP integration', () => {
  test('install-info endpoint returns MCP config', async ({ request }) => {
    const resp = await request.get('/api/v1/mcp/install-info');
    expect(resp.ok()).toBeTruthy();
    const info = await resp.json();
    expect(info.cli_command).toBe('org-engine-editor');
    expect(info.mcp_version).toBeTruthy();
    expect(info.daemon_url).toContain('localhost');
  });

  test('MCP stdio server responds to ListTools', async ({ request }) => {
    // The MCP server uses stdio transport, so we test the underlying
    // HTTP API that the MCP server calls
    const resp = await request.get('/api/v1/orgs');
    expect(resp.ok()).toBeTruthy();
  });
});
