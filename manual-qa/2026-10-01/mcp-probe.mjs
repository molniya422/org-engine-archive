import { Client } from '../../editor/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../../editor/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import { writeFileSync } from 'node:fs';

const root = 'D:/claude-ecosystem/org-engine/manual-qa/2026-10-01';
const script = "const m=require('./backend-server/bundle/mcp-stdio.cjs'); m.startMcpStdio({daemonUrl:'http://127.0.0.1:15174'}).catch(e=>{console.error(e);process.exit(1)})";
const transport = new StdioClientTransport({
  command: 'node',
  args: ['-e', script],
  cwd: 'D:/claude-ecosystem/org-engine/editor',
  stderr: 'pipe',
});
const client = new Client({ name: 'manual-qa-client', version: '1.0.0' }, { capabilities: {} });
const output = {};
await client.connect(transport);
output.tools = (await client.listTools()).tools.map((tool) => tool.name);
output.orgs = await client.callTool({ name: 'list_orgs', arguments: {} });
const orgText = output.orgs.content?.find((item) => item.type === 'text')?.text ?? '[]';
const orgs = JSON.parse(orgText);
const orgId = orgs[0]?.id ?? orgs[0]?.name;
if (orgId) {
  output.org = await client.callTool({ name: 'get_org', arguments: { id: orgId } });
  output.yaml = await client.callTool({ name: 'export_org', arguments: { id: orgId, format: 'yaml' } });
  output.validation = await client.callTool({ name: 'validate_org', arguments: { id: orgId } });
}
output.skills = await client.callTool({ name: 'list_skills', arguments: {} });
await client.close();
writeFileSync(`${root}/mcp-results.json`, JSON.stringify(output, null, 2), 'utf8');
process.stdout.write(JSON.stringify({ tools: output.tools, orgId, validation: output.validation?.content }, null, 2));
