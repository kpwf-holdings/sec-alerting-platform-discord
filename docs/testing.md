# Testing

## Manual test first
Before using Task Scheduler, run the script manually.

Example:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\scripts\vt-discord-monitor-bg-lockfix.ps1"
```

## Basic validation steps
1. Start the script manually.
2. Download a test file with a monitored extension such as `.exe`.
3. Confirm a Discord alert is received.
4. Check the local log file for a matching scan flow.

## Log file location
```text
C:\ProgramData\VTDiscordMonitor\vt-discord-monitor.log
```

## Expected success flow
For a file already known to VirusTotal, the log should look similar to:

```text
SERVICE START Monitoring: C:\Users\<user>\Downloads
DETECTED C:\Users\<user>\Downloads\example.exe
SCANNING C:\Users\<user>\Downloads\example.exe
HASH OK <sha256>
VT CHECK <sha256>
VT HIT <sha256>
ALERT SENT example.exe X/Y
DEDUPE SAVED <sha256>
```

For a new file that must be uploaded, the log should look similar to:

```text
DETECTED C:\Users\<user>\Downloads\example.exe
SCANNING C:\Users\<user>\Downloads\example.exe
HASH OK <sha256>
VT CHECK <sha256>
VT UPLOAD C:\Users\<user>\Downloads\example.exe
VT ANALYSIS CHECK 1 <analysis-id>
...
VT ANALYSIS COMPLETE <analysis-id>
ALERT SENT example.exe X/Y
DEDUPE SAVED <sha256>
```

## Duplicate-event behavior
Because both file creation and rename events can occur during a download, it is normal to occasionally see:

```text
SKIP Duplicate event in progress: <path>
```

That indicates the duplicate-event lock is working as intended.

## Common checks
### No Discord alert
Check:
- local webhook placeholder was replaced
- the file extension is in the monitored extension list
- the log file shows `ALERT SENT`
- the download completed into the watched Downloads folder

### VirusTotal upload error
Check:
- VirusTotal API key placeholder was replaced
- the script version includes multipart upload handling
- the log does not show repeated `400 Bad Request`

### No detection at all
Check:
- the script is running
- the file was downloaded into `%USERPROFILE%\Downloads`
- the file extension is monitored
- the log file contains a fresh `SERVICE START` entry

## Background validation
After configuring Task Scheduler:
1. Sign out and back in, or restart.
2. Confirm the task starts.
3. Check for a fresh `SERVICE START` line in the log.
4. Download one test file and confirm one Discord alert.
