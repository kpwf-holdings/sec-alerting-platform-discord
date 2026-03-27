# Architecture Diagram

```mermaid
flowchart TD

A[Alert Source] --> B[Cloudflare Worker]

B --> C[KV (Dedup)]
B --> D[Kanboard Task Creation]

D --> E[GitHub Issue Creation]

E --> F[Developer Action]

F --> G[GitHub Webhook]

G --> B

B --> H[Kanboard Resolve + Close]

D --> I[Discord Alerts (Critical Only)]

style B fill:#1e293b,color:#fff
style D fill:#0f766e,color:#fff
style E fill:#1d4ed8,color:#fff
style H fill:#15803d,color:#fff
```
