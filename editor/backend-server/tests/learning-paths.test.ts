import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { resolveLearningDir } from '../src/learning/paths';

describe('resolveLearningDir', () => {
  it('explicit env override always wins', () => {
    expect(resolveLearningDir('/app.asar/bundle', '/home', '/env/learning')).toBe('/env/learning');
    expect(resolveLearningDir('/dev/src', '/home', '/env/learning')).toBe('/env/learning');
  });

  it('packaged (bundle inside app.asar) → user-owned home/learning', () => {
    expect(resolveLearningDir('/resources/app.asar/backend-server/bundle', '/users/me/.org-engine-editor'))
      .toBe(join('/users/me/.org-engine-editor', 'learning'));
  });

  it('dev bundle (not asar) → engine/data/learning (shared with Python collector)', () => {
    expect(resolveLearningDir('/org-engine/editor/backend-server/bundle', '/home'))
      .toBe(join('/org-engine/editor/backend-server/bundle', '../../../engine/data/learning'));
  });
});
