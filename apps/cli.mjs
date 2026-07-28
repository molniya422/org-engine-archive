#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

if (args[0] === 'mcp') {
  const daemonUrlIndex = args.indexOf('--daemon-url');
  const daemonUrl = daemonUrlIndex !== -1 && daemonUrlIndex + 1 < args.length
    ? args[daemonUrlIndex + 1]
    : 'http://localhost:5172';

  // Start MCP stdio server
  const mcpPath = resolve(__dirname, '../backend-server/src/mcp/mcp-stdio.ts');
  if (existsSync(mcpPath)) {
    // In dev mode, use tsx to run the TypeScript file
    await import('tsx').catch(() => {});
    const { startMcpStdio } = await import(resolve(__dirname, '../backend-server/src/mcp/mcp-stdio.js'));
    await startMcpStdio({ daemonUrl });
  } else {
    // In production (built bundle), load bundled version
    const { startMcpStdio } = await import(resolve(__dirname, '../backend-server/bundle/mcp-stdio.cjs'));
    await startMcpStdio({ daemonUrl });
  }
} else {
  console.log(`Usage: org-engine-editor mcp [--daemon-url <url>]`);
  process.exit(1);
}
