# Architecture Diagram

```mermaid
flowchart TD
    A[Cloudflare / Firewalla Alerts] --> B[Cloudflare Worker]

    B --> C[Sanitize + Filter]
    C --> D[KV Deduplication]

    D --> E[Kanboard API]
    E --> F[Public Board]

    F --> G[Slack / Discord Notifications]

    B --> H[Private Logging (Future)]
