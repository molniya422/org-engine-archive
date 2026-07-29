import { zh } from './zh';
// Currently only Chinese — simple key lookup, no runtime switching needed.
// To add English back, create an en.ts and swap this variable.
const dict = zh;
/**
 * Translate a key to Chinese.
 * Falls back to the key itself if the translation is missing.
 */
export function t(key) {
    return dict[key] ?? key;
}
export { zh } from './zh';
