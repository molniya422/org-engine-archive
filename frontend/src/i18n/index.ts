import { zh, ZhKey } from './zh';

// Currently only Chinese — simple key lookup, no runtime switching needed.
// To add English back, create an en.ts and swap this variable.
const dict: Record<ZhKey, string> = zh;

/**
 * Translate a key to Chinese.
 * Falls back to the key itself if the translation is missing.
 */
export function t(key: string): string {
  return (dict as Record<string, string>)[key] ?? key;
}

export { zh } from './zh';
