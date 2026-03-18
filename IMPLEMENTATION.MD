
---

## ⚙️ 4. IMPLEMENTATION.md

```markdown
# Implementation Plan

## Phase 1 — Foundation

- Create Kanboard board
- Define columns:
  - Intake
  - Investigating
  - Critical
  - Resolved

---

## Phase 2 — Worker (v1)

- Intake endpoint
- Normalize incoming alerts
- Basic sanitization

---

## Phase 3 — KV Layer

- Add deduplication
- Add TTL-based storage

---

## Phase 4 — Kanboard Integration

- Create tasks via API
- Map severity → column

---

## Phase 5 — Notifications

- Webhooks → Slack / Discord
- Alert only on critical transitions

---

## Phase 6 — Reporting (Optional)

- Aggregate metrics
- Commit sanitized summaries
