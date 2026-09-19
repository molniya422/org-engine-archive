import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Isolated runtime dirs for the learning-loop e2e — never touch the real ~/.org-engine-editor. */
export const E2E_HOME = join(tmpdir(), 'org-engine-e2e');
export const E2E_LEARNING = join(E2E_HOME, 'learning');
export const E2E_ORGS = join(E2E_HOME, 'orgs');