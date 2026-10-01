import { join } from 'node:path';

/**
 * Learning-store location.
 *
 * Priority:
 *  1. Explicit env override (`ORG_ENGINE_LEARNING_DIR`) — tests / dev tooling.
 *  2. Packaged (bundle inside `app.asar`): the bundle-relative
 *     `../../../engine/data/learning` is NOT shipped and would sit in a
 *     possibly read-only install dir → fall back to the user-owned `home/learning`
 *     (writable, alongside orgs). This is what makes the evolution panel able to
 *     reflect real data in the packaged product.
 *  3. Dev bundle: keep `engine/data/learning` so the Python collector and the
 *     backend share the same store.
 */
export function resolveLearningDir(
  here: string,
  home: string,
  envLearningDir?: string,
): string {
  if (envLearningDir) return envLearningDir;
  if (here.includes('app.asar')) return join(home, 'learning');
  return join(here, '../../../engine/data/learning');
}
