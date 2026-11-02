# -*- coding: utf-8 -*-
"""验证 token 真的穿透到 Python 门禁：一个有写操作的任务必须能被确认后放行。"""
import json, urllib.request, urllib.error, datetime, time

B = "http://127.0.0.1:15179"
def call(method, path, body=None, timeout=240):
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

task_id = "task_p0_write"
now = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

code, out = call("POST", "/api/v1/personal/tasks", {
    "task": {
        "schema_version": 1, "id": task_id,
        "goal": "把 ten_document_inbox 里的文件数量写成 p0_write_check.md，内容只写一行：共10个文件",
        "success_criteria": ["写出文件"], "allowed_scopes": ["workspace/"],
        "forbidden_actions": ["external_send", "delete", "payment", "submit"],
        "required_evidence": ["file_ref"], "risk_level": "low",
        "confirmation_points": [], "status": "draft", "version": 1,
        "created_at": now,
    }, "evidence_refs": [],
})
print("建任务:", code, json.dumps(out, ensure_ascii=False)[:120])

code, run = call("POST", f"/api/v1/personal/tasks/{task_id}/run", {})
print("run:", code, "status =", run.get("status"))
exec_id = run.get("execution_id", "")
pending = run.get("pending_confirmation") or {}
token = pending.get("confirmation_token", "")
print("  plan.verdict =", (run.get("plan") or {}).get("verdict"))
print("  pending =", pending.get("action_label"), "/", pending.get("description"))

if token:
    code, out = call("POST", f"/api/v1/personal/executions/{exec_id}/confirm",
                     {"confirmation_token": token})
    print("确认:", code, json.dumps(out, ensure_ascii=False)[:150])

print(f"\nEXEC_ID={exec_id}")
with open("p0_write_ids.txt", "w") as f: f.write(f"{task_id}\n{exec_id}\n")
