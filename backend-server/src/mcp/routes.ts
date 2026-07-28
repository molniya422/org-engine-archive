import { FastifyInstance } from 'fastify';

export function registerMcpRoutes(app: FastifyInstance): void {
  app.get('/api/v1/mcp/install-info', async () => {
    const port = process.env.PORT || '5172';
    return {
      cli_command: 'org-engine-editor',
      cli_args: ['mcp', '--daemon-url', `http://localhost:${port}`],
      daemon_url: `http://localhost:${port}`,
      mcp_version: '1.30.0',
      platform: process.platform,
      node_version: process.version,
    };
  });
}
