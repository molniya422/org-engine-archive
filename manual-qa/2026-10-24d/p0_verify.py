# -*- coding: utf-8 -*-
import json, urllib.request, urllib.error, datetime

B = "http://127.0.0.1:15179"

def call(method, path, body=None, timeout=180):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(B + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try: return e.code, json.loads(raw)
        except Exception: return e.code, {"raw": raw}

task_id = "task_p0_confirm"
now = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

print("=== 1. 建 require_confirmation 规则（schema 合法形状）===")
code, out = call("POST", "/api/v1/personal/rules", {
    "schema_version": 1,
    "id": "rule_p0_draft",
    "when": {"event": "create_draft"},
    "then": {"action": "require_confirmation", "message": "写文件前先问我"},
    "priority": 10,
    "source": "user_explicit",
    "status": "active",
    "version": 1,
})
print("  ", code, json.dumps(out, ensure_ascii=False)[:200])
code, rules = call("GET", "/api/v1/personal/rules")
print("   已存规则数:", len(rules.get("rules", [])))

print("=== 2. 建任务 ===")
code, out = call("POST", "/api/v1/personal/tasks", {
    "task": {
        "schema_version": 1, "id": task_id,
        "goal": "在 ten_document_inbox 里列出所有文件",
        "success_criteria": ["列出文件"], "allowed_scopes": ["workspace/"],
        "forbidden_actions": ["external_send", "delete", "payment", "submit"],
        "required_evidence": ["file_ref"], "risk_level": "low",
        "confirmation_points": [], "status": "draft", "version": 1,
        "created_at": now,
    },
    "evidence_refs": [],
})
print("  ", code, json.dumps(out, ensure_ascii=False)[:200])

print("=== 3. /run → 期望停在 awaiting_confirmation ===")
code, run = call("POST", f"/api/v1/personal/tasks/{task_id}/run", {})
print("  ", code, "status =", run.get("status"))
exec_id = run.get("execution_id", "")
pending = run.get("pending_confirmation") or {}
token = pending.get("confirmation_token", "")
print("   plan.verdict =", (run.get("plan") or {}).get("verdict"))
print("   pending =", pending.get("action_label"), "/", pending.get("description"))
print("   token =", (token[:22] + "...") if token else "(none)")

print("=== 4. GET /executions/:id → 待确认动作必须可见 ===")
code, det = call("GET", f"/api/v1/personal/executions/{exec_id}")
print("  ", code, "status =", det.get("execution", {}).get("status"))
print("   pending =", json.dumps(det.get("pending_confirmation"), ensure_ascii=False))

if not token:
    print("\n!! 没有拿到 token，后面的确认步骤跳过")
    raise SystemExit(1)

print("=== 5. 伪造 token 必须 403 ===")
code, out = call("POST", f"/api/v1/personal/executions/{exec_id}/confirm",
                 {"confirmation_token": "tok_forged"})
print("  ", code, json.dumps(out, ensure_ascii=False)[:150])

print("=== 6. 真 token → 期望 202 并继续 ===")
code, out = call("POST", f"/api/v1/personal/executions/{exec_id}/confirm",
                 {"confirmation_token": token})
print("  ", code, json.dumps(out, ensure_ascii=False)[:200])

print("=== 7. 重放同一 token 必须 409 ===")
code, out = call("POST", f"/api/v1/personal/executions/{exec_id}/confirm",
                 {"confirmation_token": token})
print("  ", code, json.dumps(out, ensure_ascii=False)[:150])

with open("p0_ids.txt", "w") as f:
    f.write(f"{task_id}\n{exec_id}\n")
print("\nSAVED:", task_id, exec_id)
