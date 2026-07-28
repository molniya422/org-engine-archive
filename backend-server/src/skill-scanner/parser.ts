export interface SkillMeta {
  name: string;
  description: string;
  path: string;
}

export function parseSkillMetadata(filePath: string, content: string): SkillMeta | null {
  const match = content.match(/^---\n([\s\S]+?)\n---/);
  if (!match) return null;
  try {
    const fm = parseSimpleYaml(match[1]);
    if (!fm.name || typeof fm.name !== 'string') return null;
    return { name: fm.name, description: fm.description ?? '', path: filePath };
  } catch { return null; }
}

function parseSimpleYaml(block: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const line of block.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    let value: unknown = line.slice(idx + 1).trim();
    if (typeof value === 'string' && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) value = value.slice(1, -1);
    result[line.slice(0, idx).trim()] = value;
  }
  return result;
}
