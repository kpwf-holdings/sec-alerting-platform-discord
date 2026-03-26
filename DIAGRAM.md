# System Architecture Diagram

## Overview

- Solid lines = active components  
- Dashed lines = in-progress / future integrations  

```
Cloudflare / Firewalla Alerts
            ↓
   Cloudflare Worker
   (Intake + Routing)
        ↓        ↓
      KV       Kanboard
   (State)   (Tracking)
                  ↓
               Discord

Future:
GitHub → Worker → Kanboard (resolve)
Additional Inputs → Worker
Reporting Layer ← Worker
```
