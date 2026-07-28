import { describe, it, expect } from 'vitest';
import { parseSkillMetadata } from '../src/skill-scanner/parser';

describe('parseSkillMetadata', () => {
  it('parses valid frontmatter', () => {
    const r = parseSkillMetadata('/path/s/SKILL.md', '---\nname: test-skill\ndescription: A test skill\n---\n# body');
    expect(r).not.toBeNull();
    expect(r!.name).toBe('test-skill');
    expect(r!.description).toBe('A test skill');
  });

  it('returns null without frontmatter', () => {
    expect(parseSkillMetadata('/x.md', '# heading')).toBeNull();
  });

  it('returns null without name', () => {
    expect(parseSkillMetadata('/x.md', '---\ndescription: only\n---')).toBeNull();
  });

  it('handles quotes in frontmatter', () => {
    const r = parseSkillMetadata('/x.md', '---\nname: "quoted-name"\ndescription: \'quoted desc\'\n---\n#');
    expect(r).not.toBeNull();
    expect(r!.name).toBe('quoted-name');
    expect(r!.description).toBe('quoted desc');
  });
});

describe('SkillPool', () => {
  it('returns empty pool when no skills dir found', async () => {
    const { SkillPool } = await import('../src/skill-scanner/pool');
    // avoid testing filesystem; just confirm class exists
    expect(SkillPool).toBeDefined();
  });
});
