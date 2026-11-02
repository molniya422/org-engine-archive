/**
 * Canonical JSON —— 与 engine/personal/canonical_json.py 逐字一致。
 * 规则见 Python 侧 docstring；两侧共享 tests/fixtures/canonical-vectors.json。
 */
import { createHash } from 'node:crypto';

export function canonicalJson(value: unknown): string {
  return stringify(value);
}

function stringify(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    // 整数值（含 1.0）在 JS 里就是同一个数；Python 侧会把整数浮点归一化为 int，
    // 两侧一致。非整数浮点的字符串表示无法保证一致 → 拒绝。
    if (!Number.isFinite(v) || !Number.isInteger(v)) {
      throw new TypeError(`canonicalJson: non-integer number: ${v}`);
    }
    // 超过 2**53-1 的值在 JS 里已不能与相邻整数区分，String() 的十进制串
    // 与 Python int 不一致（JSON.parse 也会静默丢精度）。同样在入口拒绝。
    if (!Number.isSafeInteger(v)) {
      throw new TypeError(`canonicalJson: integer outside JS safe range: ${v}`);
    }
    return String(v);
  }
  if (typeof v === 'string') return JSON.stringify(assertWellFormed(v));
  if (Array.isArray(v)) {
    // 稀疏数组（[1,,3]、new Array(3)）没有对应的 JSON 文本：Python 侧
    // 根本构造不出空洞，JS 侧若用 map 会跳过空洞并产出非法 JSON → 拒绝。
    const parts: string[] = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) {
        throw new TypeError(`canonicalJson: sparse array hole at index ${i}`);
      }
      parts.push(stringify(v[i]));
    }
    return `[${parts.join(',')}]`;
  }
  if (typeof v === 'object') {
    // 只接受 JSON 原生对象：Date/Map/类实例等在 Python 侧根本不可序列化，
    // 在 JS 侧却会被 Object.keys 悄悄压成 {} 或半个对象 → 必须拒绝。
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) {
      const name = v.constructor?.name ?? 'unknown';
      throw new TypeError(`canonicalJson: unsupported object type ${name}`);
    }
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort(byCodePoint);
    return `{${keys
      .map((k) => `${JSON.stringify(assertWellFormed(k))}:${stringify(obj[k])}`)
      .join(',')}}`;
  }
  throw new TypeError(`canonicalJson: unsupported type ${typeof v}`);
}

/** 孤立代理项在 Python 侧无法编码成 UTF-8 → 两侧统一拒绝，而不是单边生成哈希。 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function assertWellFormed(s: string): string {
  if (LONE_SURROGATE.test(s)) {
    throw new TypeError('canonicalJson: lone surrogate in string');
  }
  return s;
}

/**
 * 按 Unicode 码点比较，而不是 JS 默认的 UTF-16 code unit 比较。
 * Python 的 sort_keys=True 按码点排序；两者对含 astral 字符（如 emoji）
 * 的键顺序不同，直接 .sort() 会产生不同的 canonical 字符串。
 */
function byCodePoint(a: string, b: string): number {
  const ai = Array.from(a);
  const bi = Array.from(b);
  const n = Math.min(ai.length, bi.length);
  for (let i = 0; i < n; i++) {
    const diff = (ai[i].codePointAt(0) as number) - (bi[i].codePointAt(0) as number);
    if (diff !== 0) return diff;
  }
  return ai.length - bi.length;
}

export function canonicalHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

export function canonicalHashHex(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
