# Architecture Overview

## High-Level Flow

[Alert Sources]
   ↓
[Cloudflare Worker]
   - Filtering
   - Sanitization
   - Severity scoring
   - Deduplication (KV)
   ↓
[Kanboard API]
   ↓
[Public Board View]
   ↓
[Notifications (Slack/Discord)]

---

## Components

### 1. Cloudflare Worker
Primary control layer:
- Receives alerts
- Normalizes input
- Removes sensitive data
- Routes events

---

### 2. KV (Optional / Minimal)
Used for:
- Deduplication
- Incident tracking (short-lived)

---

### 3. Kanboard
Used as:
- Public-facing incident tracker
- Sanitized task board

---

### 4. Notifications
Triggered by:
- Kanboard webhooks
- Severity changes

---

## Security Model

Sensitive data is:
- Processed internally
- Never stored in public systems
- Never committed to repository

---

## Data Classification

| Type | Location |
|------|--------|
| Raw logs | Private systems |
| Sanitized alerts | Kanboard |
| Metrics | Optional reports |
