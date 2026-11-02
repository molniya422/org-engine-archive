"""canonical JSON 跨语言 golden 向量测试（Python 侧）。

与 editor/backend-server/tests/personal-canonical-json.test.ts 读同一个
fixtures 文件；两侧必须对同一对象给出相同的 canonical 字符串与 sha256。
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from personal.canonical_json import canonical_json, canonical_hash

VECTORS = (
    Path(__file__).resolve().parents[2]
    / "editor" / "backend-server" / "tests" / "fixtures" / "canonical-vectors.json"
)


class CanonicalJsonTest(unittest.TestCase):
    def test_vectors_file_exists(self):
        self.assertTrue(VECTORS.is_file(), f"missing shared vectors at {VECTORS}")

    def test_matches_shared_vectors(self):
        data = json.loads(VECTORS.read_text(encoding="utf-8"))
        for v in data["vectors"]:
            with self.subTest(vector=v["name"]):
                self.assertEqual(canonical_json(v["value"]), v["canonical"])
                self.assertEqual(canonical_hash(v["value"]), v["sha256"])

    def test_key_order_does_not_change_hash(self):
        a = {"path": "/inbox/a.md", "content": "x"}
        b = {"content": "x", "path": "/inbox/a.md"}
        self.assertEqual(canonical_hash(a), canonical_hash(b))

    def test_array_order_does_change_hash(self):
        self.assertNotEqual(canonical_hash({"l": [1, 2]}), canonical_hash({"l": [2, 1]}))

    def test_rejects_non_serializable(self):
        with self.assertRaises(TypeError):
            canonical_json({"when": object()})

    def test_normalizes_integer_floats(self):
        """JSON 文本 {"x":1.0} 在 JS 侧 JSON.parse 后就是 1 → Python 必须归一化。"""
        self.assertEqual(canonical_json({"ratio": 1.0}), '{"ratio":1}')
        self.assertEqual(canonical_json({"nested": {"deep": [1.0, 2]}}), '{"nested":{"deep":[1,2]}}')
        self.assertEqual(canonical_json({"n": 1e3}), '{"n":1000}')

    def test_rejects_non_integer_floats(self):
        """非整数浮点两侧无法一致表示 → 必须拒绝而不是静默出错。"""
        with self.assertRaises(TypeError):
            canonical_json({"ratio": 1.5})
        with self.assertRaises(TypeError):
            canonical_json({"nested": {"deep": [0.5]}})

    def test_rejects_integer_floats_outside_js_safe_range(self):
        """整数浮点归一化后仍要过 safe-range 检查。"""
        with self.assertRaises(TypeError):
            canonical_json({"big": 1e20})

    def test_rejects_integers_beyond_js_safe_range(self):
        """超过 2**53-1 的整数在 JS 侧已无法精确表示 → 两侧必须都拒绝。"""
        with self.assertRaises(TypeError):
            canonical_json({"big": 2 ** 53})
        with self.assertRaises(TypeError):
            canonical_json({"nested": [-(2 ** 53) - 1]})

    def test_rejects_lone_surrogates(self):
        """孤立代理项两侧都无法编码成 UTF-8 → 统一在入口拒绝。"""
        with self.assertRaises(TypeError):
            canonical_json({"s": "\ud800"})
        with self.assertRaises(TypeError):
            canonical_json({"\udfff": 1})

    def test_rejects_non_string_keys(self):
        """JSON 对象键只能是字符串；int 键在两侧排序规则不同。"""
        with self.assertRaises(TypeError):
            canonical_json({1: "a"})

    def test_accepts_integers_and_bools(self):
        self.assertEqual(canonical_json({"n": 2, "b": True}), '{"b":true,"n":2}')


if __name__ == "__main__":
    unittest.main()
