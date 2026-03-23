# Usage

## Purpose
This project monitors the Windows Downloads folder for newly completed high-risk file downloads, checks them against VirusTotal, and sends Discord alerts.

## What it watches
The script watches:

```text
%USERPROFILE%\Downloads
```

## Default monitored file types
The public script is set to monitor these extensions:

- `.exe`
- `.msi`
- `.zip`
- `.rar`
- `.7z`
- `.iso`
- `.img`
- `.dll`
- `.bat`
- `.cmd`
- `.ps1`
- `.js`
- `.vbs`
- `.jar`
- `.scr`

## What happens when a file is detected
1. The script waits for the file to finish writing.
2. It hashes the file with SHA256.
3. It checks VirusTotal for an existing result.
4. If no result exists, it uploads the file to VirusTotal using multipart form-data.
5. It polls for analysis completion.
6. It sends a Discord alert with:
   - file name
   - status
   - detections
   - SHA256
   - VirusTotal link

## Alert behavior
The script can alert on:
- **Clean**
- **Suspicious**
- **Malicious**

Status is based on the VirusTotal detection count returned by the script logic.

## Duplicate protection
The monitor uses two layers of duplicate protection:

- **Processing path lock** to prevent duplicate event handling while a file is already being processed
- **Hash deduplication** to prevent re-alerting on a file that has already been scanned

## Local runtime files
The script writes local runtime data here:

```text
C:\ProgramData\VTDiscordMonitor\
```

Files created there:

```text
scanned_hashes.json
processing_paths.json
vt-discord-monitor.log
```

These files should stay local and should not be committed to the repository.

## Configuration
Before running locally, replace these placeholders in the script:

```powershell
$DiscordWebhook = "YOUR_DISCORD_WEBHOOK_URL"
$VTApiKey       = "YOUR_VT_API_KEY"
```

## Background execution
The monitor is designed to run in the background through Windows Task Scheduler. Public setup guidance is in:

```text
docs/windows-task-scheduler-setup-public.md
```
