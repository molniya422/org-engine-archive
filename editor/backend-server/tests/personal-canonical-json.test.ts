import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canonicalJson, canonicalHash } from '../src/personal/canonical-json';

interface Vectors {
  vectors: Array<{ name: string; value: unknown; canonical: string; sha256: string }>;
}

const data = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/canonical-vectors.json', import.meta.url)), 'utf-8'),
) as Vectors;

describe('canonical JSON matches Python twin', () => {
  for (const v of data.vectors) {
    it(`vector ${v.name}`, () => {
      expect(canonicalJson(v.value)).toBe(v.canonical);
      expect(canonicalHash(v.value)).toBe(v.sha256);
    });
  }

  it('reordered keys hash the same', () => {
    expect(canonicalHash({ path: '/inbox/a.md', content: 'x' }))
      .toBe(canonicalHash({ content: 'x', path: '/inbox/a.md' }));
  });

  it('array order changes the hash', () => {
    expect(canonicalHash({ l: [1, 2] })).not.toBe(canonicalHash({ l: [2, 1] }));
  });

  it('normalizes integer-valued numbers like 1.0', () => {
    // JSON 文本 {"n":1.0} 在 JS 里 JSON.parse 后就是 1；Python 侧必须同样归一化。
    expect(canonicalJson({ n: 1.0 })).toBe('{"n":1}');
    expect(canonicalJson(JSON.parse('{"n":1.0}'))).toBe('{"n":1}');
  });

  it('rejects non-integer numbers so the two languages cannot disagree', () => {
    // JS 没有 float/int 之分：1.0 就是整数 1，无法与 1 区分，这里只测真正的非整数。
    expect(() => canonicalJson({ ratio: 1.5 })).toThrow(/non-integer/);
    expect(() => canonicalJson({ nested: { deep: [0.5] } })).toThrow(/non-integer/);
  });

  it('rejects integers beyond the JS safe range', () => {
    // 2**53 在 JS 里已不能与相邻整数区分，String() 与 Python int 会给出不同的十进制串。
    expect(() => canonicalJson({ big: 2 ** 53 })).toThrow(/safe range/);
    expect(() => canonicalJson({ nested: [-(2 ** 53) - 1] })).toThrow(/safe range/);
  });

  it('rejects lone surrogates', () => {
    expect(() => canonicalJson({ s: '\ud800' })).toThrow(/surrogate/);
    expect(() => canonicalJson({ '\udfff': 1 })).toThrow(/surrogate/);
  });

  it('rejects non-plain objects', () => {
    // Date/Map 等在 Python 侧不可序列化，JS 侧不能悄悄算成 {} 或半个对象。
    expect(() => canonicalJson({ when: new Date() })).toThrow(/unsupported object/);
    expect(() => canonicalJson({ m: new Map() })).toThrow(/unsupported object/);
  });

  it('rejects undefined so optional fields cannot silently change the hash', () => {
    // JSON.stringify 会丢掉 undefined 键，Python 侧则根本没有这个键 → 必须拒绝。
    expect(() => canonicalJson({ a: undefined })).toThrow(/unsupported type/);
  });

  it('rejects sparse arrays', () => {
    // map 会跳过空洞，join 出来是 "1,,3"（非法 JSON），必须显式拒绝。
    expect(() => canonicalJson([1, , 3])).toThrow(/sparse/);
    expect(() => canonicalJson(new Array(3))).toThrow(/sparse/);
  });

  it('accepts integers and booleans', () => {
    expect(canonicalJson({ n: 2, b: true })).toBe('{"b":true,"n":2}');
  });
});
