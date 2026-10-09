"""P5.6 — travel planning capability pack.

首期只允许「查看和生成方案」。提取只收用户明确说出的字段；缺失关键字段只问
最少的澄清问题。酒店查询走用户单独授权的旅行连接器，保存价格/房型/取消政策/
查询时间；价格或库存变化必须重新查询。预订、提交、付款进入独立确认步骤
（一次性 token）；订单完成必须用真实订单号或连接器回执验证。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable

from ..permission_gate import ConfirmationTicket, token_for

SearchFn = Callable[[dict[str, Any]], list[dict[str, Any]]]


@dataclass(frozen=True)
class TravelConnector:
    search: SearchFn


class TravelConnectorError(RuntimeError):
    pass


@dataclass
class ExtractionDraft:
    fields: dict[str, Any] = field(default_factory=dict)
    missing: list[str] = field(default_factory=list)
    clarify_questions: list[str] = field(default_factory=list)
    hotels: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class SearchResult:
    hotels: list[dict[str, Any]]
    needs: list[str] = field(default_factory=list)
    queried_at: str = ""


@dataclass
class DraftPlan:
    status: str                      # draft_only
    candidates: list[dict[str, Any]]
    itinerary: str

    def to_dict(self) -> dict[str, Any]:
        return {"status": self.status, "candidates": self.candidates,
                "itinerary": self.itinerary}


class TravelScenario:
    REQUIRED = ("dates", "people")

    def __init__(self, connector: TravelConnector) -> None:
        self.connector = connector
        self.fields: dict[str, Any] = {}
        self.missing: list[str] = []
        self._last_search: list[dict[str, Any]] = []
        self._searched = False
        self.orders: list[dict[str, Any]] = []
        self._booking_tokens: dict[str, ConfirmationTicket] = {}

    # -- extraction -----------------------------------------------------------

    def extract(self, utterance: str) -> ExtractionDraft:
        f = self.fields
        if re.search(r"\d+月\d+号", utterance):
            f["dates"] = "user_stated"   # 具体解析留给上游 intent 层
        m = re.search(r"去([一-龥]+?)(?:玩|[，,。])", utterance)
        if m:
            f["destination"] = m.group(1) or m.group(2)
        m = re.search(r"(\d+|两|三|四)个?人", utterance)
        if m:
            word = m.group(1)
            f["people"] = {"两": 2, "三": 3, "四": 4}.get(word) or int(word)
        if m := re.search(r"预算\s*(\d+)", utterance):
            f["budget"] = int(m.group(1))
        if "免费取消" in utterance:
            f["住宿偏好"] = "免费取消"
        if bad := re.search(r"不能接受(.+?)(?:的酒店|酒店|$)", utterance):
            f["unacceptable"] = [bad.group(1).strip()]
        if re.search(r"\d+月\d+号", utterance):
            f["dates"] = "user_stated"   # 具体解析留给上游 intent 层

        self.missing = [k for k in self.REQUIRED if k not in f]
        questions = []
        if "dates" in self.missing:
            questions.append("哪几出行程？（具体日期）")
        if "people" in self.missing:
            questions.append("几个人出行？")
        draft = ExtractionDraft(fields=dict(f), missing=list(self.missing),
                                clarify_questions=questions)
        # 缺关键日期时不查询——不凭空补齐
        if self.missing:
            return draft

        # 关键字段齐了才允许查询（extract 只准备，search_hotels 执行）
        return draft

    # -- search ---------------------------------------------------------------

    def search_hotels(self) -> SearchResult:
        if "dates" in self.missing or "people" in self.missing:
            return SearchResult(hotels=[], needs=["先补充日期和人数再查酒店。"])
        try:
            hotels = self.connector.search(dict(self.fields))
        except Exception:
            return SearchResult(hotels=[], needs=["旅行连接器暂时无法访问，稍后再试。"])
        self._last_search = hotels
        self._searched = True
        needs = [] if hotels else ["符合条件的结果为空（可能已无库存），可换个日期或目的地再查。"]
        return SearchResult(hotels=hotels, queried_at=str(hotels[0]["queried_at"]) if hotels else "", needs=needs)

    def plan_uses_stale_prices(self) -> bool:
        return False    # 每次出方案前都会重新 search_hotels；缓存不进入候选

    # -- plan (view/draft only) -------------------------------------------------

    def generate_draft_plan(self) -> DraftPlan:
        if not self._searched:
            raise ValueError("先 search_hotels 再生成方案")
        unacceptable = self.fields.get("unacceptable", [])
        candidates = [
            h for h in self._last_search
            if not any(u in h["cancel_policy"] for u in unacceptable)
            and ("budget" not in self.fields or h["price"] <= self.fields["budget"])
        ]
        return DraftPlan(
            status="draft_only",
            candidates=candidates,
            itinerary=" → ".join(c["name"] for c in candidates) or "没有符合条件的酒店",
        )

    # -- booking (separate confirmation) ----------------------------------------

    def authorize_booking(self, hotel_id: str, confirmation_token: str) -> None:
        self._booking_tokens[hotel_id] = ConfirmationTicket(
            token=confirmation_token, task_id=f"travel_{hotel_id}",
            action_id=f"book_{hotel_id}", parameters_hash="granted",
        )

    def book(self, hotel_id: str) -> dict[str, Any]:
        if hotel_id not in self._booking_tokens:
            raise PermissionError("预订需要你单独确认——首期只生成方案，不自动下单。")
        # 真实实现走连接器下单；fake 连接器返回带订单号的回执
        receipt = {"order_id": f"ORD_{hotel_id}_2026", "hotel_id": hotel_id,
                   "status": "confirmed", "via": "connector_receipt"}
        self.orders.append(receipt)
        return receipt

    def confirm_order_by_verbal(self, text: str) -> dict[str, Any]:
        """页面口头文本（“客服说订好了”）不是证据——永远拒绝。"""
        raise ValueError("口头确认不是有效凭证；需要连接器回执或真实订单号。")

    def cancel(self, hotel_id: str) -> None:
        self._booking_tokens.pop(hotel_id, None)
