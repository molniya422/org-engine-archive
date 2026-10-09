# Decision Policy Architecture (P3.1–P3.3)

## The separation

> 把「模型觉得应该做什么」与「系统允许做什么」分开。

```text
IntentEnvelope / TaskContract
        |
        v
DecisionPolicy.evaluate(state, candidates, constraints) -> DecisionResult
        |
        |-- verdict: select | ask_user | needs_confirmation | blocked | policy_error
        |-- policy_version, rule_refs, evidence_refs, uncertainty
        v
RuleEngine (P3.4) — final authority; may only make the outcome STRICTER
        |
        v
Permission gate (P5.2) + user confirmation
```

## Implementations

| Policy | Version | Role |
| --- | --- | --- |
| `BaselinePolicy` | `baseline-0.1` | Default. Pure rules: forbidden kinds, scopes, budget, risk ceiling, info gaps → ask_user. Selection ranks lower risk > higher value > more evidence. No model needed. |
| `JEVPolicyAdapter` | `jev-adapter-0.1` | Optional. Ranks candidates with a JEV-compatible scorer (e.g. Laya `laya-serve /v1/systemone`). Select-only; missing scores → `policy_error`; hard constraints still applied identically to baseline. |

Selection is via `select_policy(config)`: `policy: "jev"` requires a scorer;
anything else falls back to baseline. **Removing JEV never affects baseline.**

## Hard invariants (tested)

1. A policy returns selections, never executions — `DecisionResult` has no
   execution fields.
2. High-risk kinds (`external_send`, `delete`, `submit`, `payment`) always
   yield `requires_confirmation=true`.
3. Information gaps ≥ threshold → `ask_user`, nothing executes.
4. Facts without evidence never enter the decision state (they degrade to
   unknown at the caller boundary).
5. Missing/invalid JEV output → `policy_error`, never guessed completion.
6. Every result carries `policy_version` for replayable `DecisionTrace`.

## Laya notes (from the 2026-10-04 review)

- Laya is a 421M text-classification model (typed questions → choice/score/
  noul). Use `laya-multilingual` for Chinese; the English root model must not
  be a silent default.
- `act_probability` alone never grants execution — calibration on personal
  data + rules + confirmation decide together.
- The scorer interface here (`JevScorer.score(question) -> answers`) is the
  only surface P4.4's Octop/Laya adapter needs to implement.
