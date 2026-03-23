# Windows Task Scheduler Setup (Public / Sanitized)

## Script path
```text
C:\scripts\vt-discord-monitor-bg-lockfix.ps1
```

## PowerShell path
```text
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
```

## Suggested task
**Name:** `VT Discord Monitor`

**Description:**  
Monitors the Windows Downloads folder for newly completed high-risk file downloads, checks them against VirusTotal, sends Discord alerts, prevents duplicate event processing, and writes operational logs to `C:\ProgramData\VTDiscordMonitor`.

## Action
**Program/script**
```text
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
```

**Add arguments**
```text
-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\scripts\vt-discord-monitor-bg-lockfix.ps1"
```

**Start in**
```text
C:\scripts
```

## Trigger
- At log on
- Specific user account
- Enabled

## General
- Run only when user is logged on
- Run with highest privileges
- Hidden

## Settings
- Allow task to be run on demand
- Run task as soon as possible after a scheduled start is missed
- If the task fails, restart every 1 minute
- Attempt to restart up to 3 times
- If the task is already running: **Do not start a new instance**

## Validation
After saving the task, check:
- Task Scheduler **Last Run Result** = `0x0`
- Log file contains a fresh `SERVICE START` entry
- One download produces one Discord alert
