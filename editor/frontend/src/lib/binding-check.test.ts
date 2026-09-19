import { describe, it, expect } from 'vitest';
import { collectWorkflowRefs, findBrokenRefs, detectFlowCycles } from './binding-check';

const WFS = [
  {
    name: 'a-flow',
    nodes: [
      { id: 'n1', type: 'agent', role_ref: 'arch.architect' },
      { id: 'n2', type: 'agent', role_ref: 'ghost.role' }, // 断引用
    ],
    edges: [] as any[],
  },
  {
    name: 'b-flow',
    nodes: [{ id: 'm1', type: 'agent', role_ref: 'arch.architect' }],
    edges: [] as any[],
  },
];

const ORG = { org: { departments: [{ roles: [{ id: 'arch.architect' }] }] } };

describe('binding-check', () => {
  it('collectWorkflowRefs maps each role_ref to referencing workflows', () => {
    const refs = collectWorkflowRefs(WFS);
    expect(refs.get('arch.architect')).toEqual(['a-flow', 'b-flow']);
    expect(refs.get('ghost.role')).toEqual(['a-flow']);
  });

  it('findBrokenRefs reports nodes whose role_ref is not in the org', () => {
    expect(findBrokenRefs(ORG, WFS)).toEqual(['a-flow:n2->ghost.role']);
    // 全有效 → 无断引用
    expect(findBrokenRefs(ORG, [WFS[1]])).toEqual([]);
  });

  it('detectFlowCycles returns empty for acyclic flow edges', () => {
    expect(
      detectFlowCycles([
        { source: 'a', target: 'b', kind: 'flow' },
        { source: 'b', target: 'c', kind: 'flow' },
      ]),
    ).toEqual([]);
  });

  it('detectFlowCycles ignores message edges (no flow dependency)', () => {
    // a→b 是消息边，不算流程依赖 → 无环
    expect(detectFlowCycles([{ source: 'a', target: 'b', kind: 'message' }])).toEqual([]);
  });

  it('detectFlowCycles finds the nodes on a flow cycle', () => {
    const cycles = detectFlowCycles([
      { source: 'a', target: 'b', kind: 'flow' },
      { source: 'b', target: 'a', kind: 'flow' },
    ]);
    expect(cycles.length).toBe(1);
    expect(cycles[0].sort()).toEqual(['a', 'b']);
  });

  it('detectFlowCycles detects a self-loop', () => {
    expect(detectFlowCycles([{ source: 'a', target: 'a', kind: 'flow' }])).toEqual([['a']]);
  });
});
