# VT Discord Downloads Monitor

Public, sanitized Windows monitor that watches the Downloads folder for newly completed high-risk file downloads, checks them against VirusTotal, and sends Discord alerts.

## Features
- Watches `%USERPROFILE%\Downloads`
- Checks known file hashes with VirusTotal
- Uploads unknown files to VirusTotal using multipart form-data
- Sends Discord alerts with file name, status, detections, SHA256, and VT link
- Prevents duplicate alerts with path locking and hash deduplication
- Supports background execution with Task Scheduler

## Repo layout
```text
scripts/vt-discord-monitor-bg-lockfix.ps1
docs/windows-task-scheduler-setup-public.md
```

## Configuration
Replace placeholders locally before running:

```powershell
$DiscordWebhook = "YOUR_DISCORD_WEBHOOK_URL"
$VTApiKey       = "YOUR_VT_API_KEY"
```

## Runtime files
The script writes local runtime artifacts outside the repository:

- `C:\ProgramData\VTDiscordMonitor\scanned_hashes.json`
- `C:\ProgramData\VTDiscordMonitor\processing_paths.json`
- `C:\ProgramData\VTDiscordMonitor\vt-discord-monitor.log`

## Security note
Do not commit real Discord webhook URLs, VirusTotal API keys, logs, or runtime state files.
