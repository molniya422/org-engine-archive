"""Canonical JSON —— TS 与 Python 的唯一定义。

规则（两侧必须逐字一致）：
1. 对象键按 Unicode 码点升序排序（递归）；
2. 分隔符固定为 (",", ":")，冒号后无空格；
3. 非 ASCII 字符不转义（ensure_ascii=False），编码 UTF-8；
4. 数组保持原顺序；
5. null → null，true/false → true/false；
6. **数字归一化后只允许整数**（bool 除外），且必须在 JS 安全整数范围内
   （|n| ≤ 2**53-1）。整数浮点（1.0、1e3）先归一化为 int——JSON 文本里的
   `{"x": 1.0}` 在 JS 侧 JSON.parse 后就是 1，Python 侧若拒绝就会让同一份
   文档在两侧行为不同。真正的非整数浮点（1.5、0.5）仍抛 TypeError：
   两侧的字符串表示无法保证一致（指数记法、尾数差异）；超出安全范围的
   整数在 JSON.parse 后会静默丢精度。与其静默算出不同哈希，不如在入口拒绝。
   工具参数（路径/内容/布尔/计数）不需要浮点。
7. 字符串必须是合法 Unicode：孤立代理项（lone surrogate）两侧都无法编码成
   UTF-8，统一抛 TypeError。Python 若放任不管会在 encode 阶段抛
   UnicodeEncodeError，JS 则会生成一个永远无法被 Python 校验的哈希。
"""

from __future__ import annotations

import hashlib
import json
from typing import Any


def _normalize(value: Any, path: str = "$") -> Any:
    """归一化数字（整数浮点→int），并拒绝两侧无法一致表示的值。"""
    if isinstance(value, bool):
        return value
    if isinstance(value, float):
        # JSON 文本 1.0 在 JS 侧 JSON.parse 后就是 1；Python 侧必须同样归一化，
        # 否则同一份文档在两侧一个通过、一个抛错。
        if not value.is_integer():
            raise TypeError(f"canonical_json: non-integer number at {path}: {value!r}")
        as_int = int(value)
        if abs(as_int) > 2 ** 53 - 1:
            raise TypeError(f"canonical_json: integer outside JS safe range at {path}: {value!r}")
        return as_int
    if isinstance(value, int):
        # 超过 2**53-1 的整数在 JS 侧已无法精确表示（JSON.parse 会静默丢精度），
        # 两侧会得到不同的十进制串。与浮点同理：入口拒绝，不静默出错。
        if abs(value) > 2 ** 53 - 1:
            raise TypeError(f"canonical_json: integer outside JS safe range at {path}: {value!r}")
        return value
    if isinstance(value, str):
        if any(0xD800 <= ord(ch) <= 0xDFFF for ch in value):
            raise TypeError(f"canonical_json: lone surrogate in string at {path}")
        return value
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for k, v in value.items():
            # JSON 对象键只能是字符串；Python 允许 int/bool 键，但排序规则
            # 与 JS 的属性名（先转字符串再按码点排）不同 → 拒绝，不猜。
            if not isinstance(k, str):
                raise TypeError(f"canonical_json: non-string object key at {path}: {k!r}")
            _normalize(k, f"{path}.<key>")
            out[k] = _normalize(v, f"{path}.{k}")
        return out
    if isinstance(value, (list, tuple)):
        return [_normalize(v, f"{path}[{i}]") for i, v in enumerate(value)]
    return value


def canonical_json(value: Any) -> str:
    return json.dumps(
        _normalize(value),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def canonical_hash(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def canonical_hash_hex(value: Any) -> str:
    """Raw hex without the ``sha256:`` prefix (permission gate 历史格式)。"""
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()
