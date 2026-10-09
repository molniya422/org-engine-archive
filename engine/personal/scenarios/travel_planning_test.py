"""P5.6 tests — travel planning capability pack.

验收：模拟价格变化、库存消失、取消政策冲突、连接器失败和用户取消；
任何未确认方案不得创建真实订单。
首期只允许"查看和生成方案"；预订/提交/付款必须进入独立确认步骤；
订单完成必须用真实订单号或连接器回执验证。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from personal.scenarios.travel_planning import (
    TravelConnector,
    TravelConnectorError,
    TravelScenario,
)


def connector() -> TravelConnector:
    """Fake 旅行连接器：两家酒店，可变价格与库存。"""
    return TravelConnector(search=lambda q: [
        {
            "hotel_id": "h1", "name": "朝阳酒店", "price": 520, "room": "大床房",
            "cancel_policy": "入住前1天免费取消",
            "queried_at": "2026-10-09T10:00:00+08:00",
        },
        {
            "hotel_id": "h2", "name": "西湖宾馆", "price": 380, "room": "双床房",
            "cancel_policy": "不可取消",
            "queried_at": "2026-10-09T10:00:00+08:00",
        },
    ])


class TestFieldExtraction(unittest.TestCase):
    def test_extracts_explicit_fields_only(self):
        """只提取用户明确说出的字段；没说的进 missing。"""
        s = TravelScenario(connector=connector())
        draft = s.extract("11月1号到3号两个人去杭州玩，预算2000，要能免费取消的酒店")
        self.assertEqual(draft.fields.get("destination"), "杭州")
        self.assertEqual(draft.fields.get("people"), 2)
        self.assertEqual(draft.fields.get("budget"), 2000)
        self.assertEqual(draft.fields.get("住宿偏好"), "免费取消")

    def test_minimal_clarification_questions(self):
        """缺失关键字段时只提出最少的澄清问题，不凭空补齐。"""
        s = TravelScenario(connector=connector())
        draft = s.extract("去杭州玩")
        self.assertTrue(draft.missing)   # 日期、人数至少缺
        self.assertLessEqual(len(draft.clarify_questions), 2)
        self.assertEqual(draft.hotels, [])   # 没查，因为没有日期

    def test_unacceptable_conditions_recorded(self):
        s = TravelScenario(connector=connector())
        draft = s.extract("11月1号到3号两个人去杭州，预算2000，不能接受不可取消的酒店")
        self.assertIn("不可取消", draft.fields.get("unacceptable", []))


class TestHotelSearch(unittest.TestCase):
    def test_search_saves_price_room_policy_time(self):
        """查询酒店保存价格、房型、取消政策和查询时间。"""
        s = TravelScenario(connector=connector())
        s.extract("11月1号到3号两个人去杭州，预算2000")
        result = s.search_hotels()
        self.assertTrue(result.hotels)
        h = result.hotels[0]
        for key in ("price", "room", "cancel_policy", "queried_at"):
            self.assertIn(key, h)

    def test_price_change_requires_requery(self):
        """价格变化必须重新查询——缓存结果不用于出方案。"""
        prices = {"h1": 520, "h2": 380}
        dynamic = TravelConnector(search=lambda q: [
            {"hotel_id": "h1", "name": "朝阳酒店", "price": prices["h1"], "room": "大床房",
             "cancel_policy": "入住前1天免费取消", "queried_at": "2026-10-09T10:00:00+08:00"},
        ])
        s = TravelScenario(connector=dynamic)
        s.extract("11月1号到3号两个人去杭州，预算2000")
        first = s.search_hotels()
        prices["h1"] = 999            # 价格涨了
        second = s.search_hotels()
        self.assertNotEqual(
            first.hotels[0]["price"], second.hotels[0]["price"])
        self.assertFalse(s.plan_uses_stale_prices())

    def test_inventory_gone_means_no_candidate(self):
        empty = TravelConnector(search=lambda q: [])
        s = TravelScenario(connector=empty)
        s.extract("11月1号到3号两个人去杭州，预算2000")
        result = s.search_hotels()
        self.assertEqual(result.hotels, [])
        self.assertTrue(result.needs)


class TestProposalBoundaries(unittest.TestCase):
    def setUp(self):
        self.s = TravelScenario(connector=connector())
        self.s.extract("11月1号到3号两个人去杭州，预算2000")
        self.result = self.s.search_hotels()

    def test_first_phase_view_and_draft_only(self):
        """首期只允许查看和生成方案；没有预订路径。"""
        plan = self.s.generate_draft_plan()
        self.assertTrue(plan.candidates)
        self.assertEqual(plan.status, "draft_only")
        d = plan.to_dict()
        self.assertNotIn("book", d)

    def test_booking_requires_separate_confirmation(self):
        """预订/提交/付款必须进入独立确认步骤——无 token 一律拒绝。"""
        with self.assertRaises(PermissionError):
            self.s.book("h1")

    def test_cancel_policy_conflict_filtered(self):
        """取消政策冲突（用户不可接受"不可取消"）→ 该酒店不进候选。"""
        s = TravelScenario(connector=connector())
        s.extract("11月1号到3号两个人去杭州，预算2000，不能接受不可取消的酒店")
        s.search_hotels()
        plan = s.generate_draft_plan()
        self.assertFalse(any(c["hotel_id"] == "h2" for c in plan.candidates))

    def test_connector_failure_is_recoverable(self):
        def boom(q):
            raise ConnectionError("connector down")
        s = TravelScenario(connector=TravelConnector(boom))
        s.extract("11月1号到3号两个人去杭州，预算2000")
        result = s.search_hotels()
        self.assertEqual(result.hotels, [])
        self.assertTrue(any("无法" in n for n in result.needs))


class TestOrderVerification(unittest.TestCase):
    def test_order_requires_real_confirmation_number(self):
        """订单完成必须用真实订单号或连接器回执验证，不能依据页面口头文本。"""
        s = TravelScenario(connector=connector())
        s.extract("11月1号到3号两个人去杭州，预算2000")
        s.search_hotels()
        s.authorize_booking("h1", confirmation_token="tok_user_clicked")
        receipt = s.book("h1")
        self.assertIn("order_id", receipt)
        # 口头文本"订好了"不是证据
        with self.assertRaises(ValueError):
            s.confirm_order_by_verbal("客服说订好了")

    def test_user_cancellation_leaves_no_order(self):
        s = TravelScenario(connector=connector())
        s.extract("11月1号到3号两个人去杭州，预算2000")
        s.search_hotels()
        s.authorize_booking("h1", confirmation_token="tok_user_clicked")
        s.cancel("h1")
        self.assertEqual(s.orders, [])


if __name__ == "__main__":
    unittest.main()
