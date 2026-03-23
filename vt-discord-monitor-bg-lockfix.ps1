# VT Discord Downloads Monitor (Public / Sanitized)
# Monitors the Windows Downloads folder for newly completed high-risk file downloads,
# checks them against VirusTotal, sends Discord alerts, prevents duplicate event
# processing, and writes operational logs locally.
#
# IMPORTANT:
# - Keep secrets local only.
# - Do not commit real Discord webhook URLs or VirusTotal API keys.
# - Replace placeholders locally before running.

# ================================
# CONFIG
# ================================
$DiscordWebhook = "YOUR_DISCORD_WEBHOOK_URL"
$VTApiKey       = "YOUR_VT_API_KEY"
$WatchPath      = "$env:USERPROFILE\Downloads"
$StatePath      = "$env:ProgramData\VTDiscordMonitor"
$StateFile      = Join-Path $StatePath "scanned_hashes.json"
$ProcessingFile = Join-Path $StatePath "processing_paths.json"
$LogFile        = Join-Path $StatePath "vt-discord-monitor.log"

# Optional: only scan these extensions
$AllowedExtensions = @(
    ".exe", ".msi", ".zip", ".rar", ".7z", ".iso", ".img",
    ".dll", ".bat", ".cmd", ".ps1", ".js", ".vbs", ".jar", ".scr"
)

# ================================
# PREP
# ================================
if ([string]::IsNullOrWhiteSpace($DiscordWebhook) -or $DiscordWebhook -eq "YOUR_DISCORD_WEBHOOK_URL") {
    Write-Host "Set your Discord webhook URL first."
    exit
}

if ([string]::IsNullOrWhiteSpace($VTApiKey) -or $VTApiKey -eq "YOUR_VT_API_KEY") {
    Write-Host "Set your VirusTotal API key first."
    exit
}

if (-not (Test-Path $WatchPath)) {
    Write-Host "Watch path does not exist: $WatchPath"
    exit
}

if (-not (Test-Path $StatePath)) {
    New-Item -Path $StatePath -ItemType Directory -Force | Out-Null
}

if (-not (Test-Path $StateFile)) {
    "[]" | Set-Content -Path $StateFile -Encoding UTF8
}

if (-not (Test-Path $ProcessingFile)) {
    "[]" | Set-Content -Path $ProcessingFile -Encoding UTF8
}

if (-not (Test-Path $LogFile)) {
    New-Item -Path $LogFile -ItemType File -Force | Out-Null
}

# ================================
# HELPERS
# ================================
function Write-Log {
    param ([string]$Message)

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogFile -Value "$timestamp $Message"
}

# ================================
# WATCHER SETUP
# ================================
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $WatchPath
$watcher.Filter = "*.*"
$watcher.IncludeSubdirectories = $false
$watcher.EnableRaisingEvents = $true

$config = @{
    DiscordWebhook    = $DiscordWebhook
    VTApiKey          = $VTApiKey
    StateFile         = $StateFile
    ProcessingFile    = $ProcessingFile
    LogFile           = $LogFile
    AllowedExtensions = $AllowedExtensions
}

# ================================
# EVENT HANDLER
# ================================
$eventAction = {
    function Write-EventLog {
        param ([string]$Message)
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Add-Content -Path $Event.MessageData.LogFile -Value "$timestamp $Message"
    }

    function Get-JsonArrayFile {
        param ([string]$Path)

        try {
            if (-not (Test-Path $Path)) { return @() }
            $raw = Get-Content -Path $Path -Raw -ErrorAction Stop
            if ([string]::IsNullOrWhiteSpace($raw)) { return @() }
            $data = $raw | ConvertFrom-Json -ErrorAction Stop
            if ($null -eq $data) { return @() }
            return @($data)
        } catch {
            Write-EventLog "WARN Failed reading JSON file: $Path"
            return @()
        }
    }

    function Save-JsonArrayFile {
        param (
            [string]$Path,
            [array]$Items
        )

        try {
            @($Items) | ConvertTo-Json -Depth 5 | Set-Content -Path $Path -Encoding UTF8
        } catch {
            Write-EventLog "ERROR Failed writing JSON file: $Path | $($_.Exception.Message)"
        }
    }

    function Normalize-EventPath {
        param ([string]$InputPath)

        if ([string]::IsNullOrWhiteSpace($InputPath)) { return $null }

        try {
            return [System.IO.Path]::GetFullPath($InputPath).ToLowerInvariant()
        } catch {
            return $InputPath.ToLowerInvariant()
        }
    }

    function Remove-StaleProcessingEntries {
        param (
            [array]$Entries,
            [int]$MaxAgeMinutes = 30
        )

        $cutoff = (Get-Date).AddMinutes(-1 * $MaxAgeMinutes)
        $kept = @()

        foreach ($entry in @($Entries)) {
            if ($entry -is [string]) {
                $kept += [pscustomobject]@{
                    path      = $entry
                    startedAt = (Get-Date).ToString("o")
                }
                continue
            }

            if ($null -eq $entry.path) { continue }

            $startedAt = $null
            try {
                $startedAt = [datetime]$entry.startedAt
            } catch {
                $startedAt = Get-Date
            }

            if ($startedAt -ge $cutoff) {
                $kept += [pscustomobject]@{
                    path      = [string]$entry.path
                    startedAt = $startedAt.ToString("o")
                }
            }
        }

        return @($kept)
    }

    function Test-AndAddProcessingPath {
        param (
            [string]$ProcessingPathFile,
            [string]$NormalizedPath
        )

        $entries = Get-JsonArrayFile -Path $ProcessingPathFile
        $entries = Remove-StaleProcessingEntries -Entries $entries

        foreach ($entry in @($entries)) {
            if ([string]$entry.path -eq $NormalizedPath) {
                return $false
            }
        }

        $entries += [pscustomobject]@{
            path      = $NormalizedPath
            startedAt = (Get-Date).ToString("o")
        }

        Save-JsonArrayFile -Path $ProcessingPathFile -Items $entries
        return $true
    }

    function Remove-ProcessingPath {
        param (
            [string]$ProcessingPathFile,
            [string]$NormalizedPath
        )

        $entries = Get-JsonArrayFile -Path $ProcessingPathFile
        $updated = @()

        foreach ($entry in @($entries)) {
            $entryPath = $null
            if ($entry -is [string]) {
                $entryPath = $entry
            } else {
                $entryPath = [string]$entry.path
            }

            if ($entryPath -ne $NormalizedPath) {
                $updated += $entry
            }
        }

        Save-JsonArrayFile -Path $ProcessingPathFile -Items $updated
    }

    function Invoke-EventVTFileUpload {
        param (
            [string]$FilePath,
            [string]$ApiKey
        )

        Add-Type -AssemblyName System.Net.Http

        $client = New-Object System.Net.Http.HttpClient
        $client.DefaultRequestHeaders.Add("x-apikey", $ApiKey)

        try {
            $fileStream = [System.IO.File]::OpenRead($FilePath)
            $fileContent = New-Object System.Net.Http.StreamContent($fileStream)
            $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/octet-stream")

            $multipart = New-Object System.Net.Http.MultipartFormDataContent
            $null = $multipart.Add($fileContent, "file", [System.IO.Path]::GetFileName($FilePath))

            $response = $client.PostAsync("https://www.virustotal.com/api/v3/files", $multipart).GetAwaiter().GetResult()
            $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()

            if (-not $response.IsSuccessStatusCode) {
                throw "VT upload failed: HTTP $([int]$response.StatusCode) $($response.ReasonPhrase) | $body"
            }

            return ($body | ConvertFrom-Json)
        }
        finally {
            if ($fileStream) { $fileStream.Dispose() }
            if ($fileContent) { $fileContent.Dispose() }
            if ($multipart) { $multipart.Dispose() }
            if ($client) { $client.Dispose() }
        }
    }

    try {
        $cfg  = $Event.MessageData
        $path = $Event.SourceEventArgs.FullPath

        if ([string]::IsNullOrWhiteSpace($path)) { return }
        if ($path -match '\.tmp$|\.crdownload$|\.part$') { return }

        $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
        if ($cfg.AllowedExtensions -notcontains $ext) {
            Write-EventLog "SKIP Extension not monitored: $path"
            return
        }

        $normalizedPath = Normalize-EventPath -InputPath $path
        if (-not $normalizedPath) {
            Write-EventLog "SKIP Could not normalize path: $path"
            return
        }

        $pathLockAdded = Test-AndAddProcessingPath -ProcessingPathFile $cfg.ProcessingFile -NormalizedPath $normalizedPath
        if (-not $pathLockAdded) {
            Write-EventLog "SKIP Duplicate event in progress: $path"
            return
        }

        try {
            Write-EventLog "DETECTED $path"

            $isReady = $false
            for ($i = 0; $i -lt 30; $i++) {
                try {
                    $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)
                    $stream.Close()
                    $isReady = $true
                    break
                } catch {
                    Start-Sleep -Milliseconds 500
                }
            }

            if (-not $isReady) {
                Write-EventLog "SKIP File never unlocked: $path"
                return
            }

            Write-EventLog "SCANNING $path"

            $hash = Get-FileHash -Path $path -Algorithm SHA256
            $sha256 = $hash.Hash
            $fileName = Split-Path $path -Leaf

            $knownHashes = Get-JsonArrayFile -Path $cfg.StateFile
            if ($knownHashes -contains $sha256) {
                Write-EventLog "SKIP Duplicate hash: $sha256 $fileName"
                return
            }

            Write-EventLog "HASH OK $sha256"

            $headers = @{
                "x-apikey" = $cfg.VTApiKey
            }

            $stats = $null

            try {
                Write-EventLog "VT CHECK $sha256"
                $response = Invoke-RestMethod -Uri "https://www.virustotal.com/api/v3/files/$sha256" -Headers $headers -Method Get -ErrorAction Stop
                $stats = $response.data.attributes.last_analysis_stats
                Write-EventLog "VT HIT $sha256"
            } catch {
                Write-EventLog "VT UPLOAD $path"

                $upload = Invoke-EventVTFileUpload -FilePath $path -ApiKey $cfg.VTApiKey

                if (-not $upload.data.id) {
                    Write-EventLog "ERROR Upload succeeded but analysis ID missing."
                    return
                }

                $analysisId = $upload.data.id

                for ($attempt = 1; $attempt -le 12; $attempt++) {
                    Start-Sleep -Seconds 10
                    Write-EventLog "VT ANALYSIS CHECK $attempt $analysisId"

                    try {
                        $analysis = Invoke-RestMethod -Uri "https://www.virustotal.com/api/v3/analyses/$analysisId" -Headers $headers -Method Get -ErrorAction Stop

                        if ($analysis.data.attributes.status -eq "completed") {
                            $stats = $analysis.data.attributes.stats
                            Write-EventLog "VT ANALYSIS COMPLETE $analysisId"
                            break
                        }
                    } catch {
                        Write-EventLog "WARN VT analysis check failed on attempt $attempt"
                    }
                }

                if (-not $stats) {
                    Write-EventLog "ERROR VT analysis did not complete in time."
                    return
                }
            }

            $detections = [int]$stats.malicious
            $total = [int](
                $stats.malicious +
                $stats.suspicious +
                $stats.harmless +
                $stats.undetected
            )

            $statusText = "Clean"
            if ($detections -ge 10) {
                $statusText = "Malicious"
            } elseif ($detections -gt 0) {
                $statusText = "Suspicious"
            }

            $payload = @{
                username = "VT Scanner"
                embeds   = @(
                    @{
                        title = "VirusTotal Scan Result"
                        fields = @(
                            @{ name = "File";       value = $fileName; inline = $true  }
                            @{ name = "Status";     value = $statusText; inline = $true }
                            @{ name = "Detections"; value = "$detections/$total"; inline = $true }
                            @{ name = "SHA256";     value = $sha256; inline = $false }
                            @{ name = "VT Link";    value = "https://www.virustotal.com/gui/file/$sha256"; inline = $false }
                        )
                        timestamp = (Get-Date).ToString("o")
                    }
                )
            } | ConvertTo-Json -Depth 6

            Invoke-RestMethod -Uri $cfg.DiscordWebhook -Method Post -Body $payload -ContentType "application/json" -ErrorAction Stop
            Write-EventLog "ALERT SENT $fileName $detections/$total"

            $updatedHashes = @($knownHashes + $sha256 | Select-Object -Unique)
            if ($updatedHashes.Count -gt 5000) {
                $updatedHashes = $updatedHashes[-5000..-1]
            }

            @($updatedHashes) | ConvertTo-Json -Depth 5 | Set-Content -Path $cfg.StateFile -Encoding UTF8
            Write-EventLog "DEDUPE SAVED $sha256"
        }
        finally {
            Remove-ProcessingPath -ProcessingPathFile $cfg.ProcessingFile -NormalizedPath $normalizedPath
        }
    }
    catch {
        Write-EventLog "ERROR $($_.Exception.Message)"
    }
}

# ================================
# REGISTER EVENTS
# ================================
Register-ObjectEvent -InputObject $watcher -EventName Renamed -MessageData $config -Action $eventAction | Out-Null
Register-ObjectEvent -InputObject $watcher -EventName Created -MessageData $config -Action $eventAction | Out-Null

# ================================
# START
# ================================
Write-Log "SERVICE START Monitoring: $WatchPath"
Write-Host "Monitoring: $WatchPath"

while ($true) {
    Start-Sleep -Seconds 5
}
