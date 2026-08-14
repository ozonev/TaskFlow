<#
Launches the whole TaskFlow stack (Api + Web + Postgres) through the Aspire AppHost, drives it
end-to-end over real HTTP against the orchestrated Api and Web resources, then shuts the AppHost
down cleanly. This is the primary "Run (agent path)" driver -- see SKILL.md.

The Postgres container is intentionally left running afterwards (ContainerLifetime.Persistent in
src/TaskFlow.AppHost/AppHost.cs) so repeated runs reuse the same database instead of re-migrating
from scratch every time. Stop it manually with `docker stop <name>` if you want a clean slate.

Exit code is non-zero if any step fails.

Usage: pwsh .claude/skills/run-taskflow/aspire-smoke.ps1
Run from the repo root (paths below are relative to it).
#>

$ErrorActionPreference = "Stop"
$apiUrl = "http://localhost:5274"
$webUrl = "http://localhost:5273"
$logOut = "$env:TEMP\taskflow-apphost.log"

Write-Host "== check Docker is running (needed for the Postgres container) =="
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker daemon not reachable -- start Docker Desktop/Rancher Desktop first" }

Write-Host "== clear any stray listeners from a previous run =="
# `dotnet run` for the AppHost execs a child process, and AddViteApp spawns node.exe -- neither
# receives Ctrl+C/SIGTERM cleanly if a prior run was killed hard, so ports can be left locked.
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in 5273, 5274, 7210, 17051 } |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500

Write-Host "== launch the AppHost (Api + Web + Postgres) =="
$proc = Start-Process -FilePath "dotnet" `
    -ArgumentList "run --project src/TaskFlow.AppHost" `
    -RedirectStandardOutput $logOut -RedirectStandardError "$env:TEMP\taskflow-apphost.err.log" -PassThru -WindowStyle Hidden

try {
    Write-Host "== wait for the AppHost to finish starting =="
    $started = $false
    for ($i = 0; $i -lt 60; $i++) {
        if ((Get-Content $logOut -Raw -ErrorAction SilentlyContinue) -match "Distributed application started") { $started = $true; break }
        if ((Get-Content $logOut -Raw -ErrorAction SilentlyContinue) -match "Unhandled exception|Hosting failed to start") {
            Get-Content $logOut -ErrorAction SilentlyContinue
            throw "AppHost failed to start -- see log above"
        }
        Start-Sleep -Seconds 1
    }
    if (-not $started) { throw "AppHost did not report 'Distributed application started' in time" }
    (Get-Content $logOut -Raw) -split "`n" | Select-String "Dashboard:|Login URL:" | ForEach-Object { Write-Host $_.Line.Trim() }

    Write-Host "== wait for /health (Postgres-backed Api) =="
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $r = Invoke-WebRequest -Uri "$apiUrl/health" -UseBasicParsing -TimeoutSec 2
            if ($r.StatusCode -eq 200) { $ready = $true; break }
        } catch {}
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw "Api did not become healthy in time" }
    Write-Host "Api healthy"

    Write-Host "== wait for the Vite dev server (pinned to port 5273 in AppHost.cs) =="
    $webReady = $false
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $r = Invoke-WebRequest -Uri $webUrl -UseBasicParsing -TimeoutSec 2
            if ($r.StatusCode -eq 200) { $webReady = $true; break }
        } catch {}
        Start-Sleep -Seconds 1
    }
    if (-not $webReady) { throw "Web (Vite) did not become ready in time -- cold npm/vite start can be slow, rerun if this is the very first launch" }
    Write-Host "Web reachable"

    Write-Host "== POST /api/projects (create, against the orchestrated Postgres db) =="
    $body = @{ name = "Website Redesign"; description = "Q3 marketing site refresh" } | ConvertTo-Json
    $create = Invoke-WebRequest -Uri "$apiUrl/api/projects" -Method Post -ContentType "application/json" -Body $body -UseBasicParsing
    if ($create.StatusCode -ne 201) { throw "expected 201, got $($create.StatusCode)" }
    $created = $create.Content | ConvertFrom-Json
    Write-Host $create.Content
    if (-not $create.Headers.Location) { throw "expected Location header on 201" }

    Write-Host "== GET /api/projects/{id} (read what we just created) =="
    $get = Invoke-WebRequest -Uri "$apiUrl/api/projects/$($created.id)" -UseBasicParsing
    if ($get.StatusCode -ne 200) { throw "expected 200, got $($get.StatusCode)" }
    Write-Host $get.Content

    Write-Host "== GET /api/projects/{random-guid} (404) =="
    try {
        Invoke-WebRequest -Uri "$apiUrl/api/projects/00000000-0000-0000-0000-000000000000" -UseBasicParsing | Out-Null
        throw "expected 404"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw }
        Write-Host "404 as expected"
    }

    Write-Host "== POST /api/projects with no name (400 validation) =="
    try {
        Invoke-WebRequest -Uri "$apiUrl/api/projects" -Method Post -ContentType "application/json" -Body '{"description":"no name"}' -UseBasicParsing | Out-Null
        throw "expected 400"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -ne 400) { throw }
        Write-Host "400 as expected"
    }

    Write-Host "== CORS preflight from the Web origin (proves the pinned port matches Cors:AllowedOrigins) =="
    $preflight = Invoke-WebRequest -Uri "$apiUrl/api/projects" -Method Options -UseBasicParsing `
        -Headers @{ Origin = $webUrl; "Access-Control-Request-Method" = "POST"; "Access-Control-Request-Headers" = "Content-Type" }
    if ($preflight.Headers["Access-Control-Allow-Origin"] -ne $webUrl) { throw "expected Access-Control-Allow-Origin: $webUrl, got $($preflight.Headers["Access-Control-Allow-Origin"])" }
    Write-Host "CORS allows $webUrl"

    Write-Host "== ALL CHECKS PASSED =="
}
finally {
    Write-Host "== stop the AppHost (Postgres container is left running -- ContainerLifetime.Persistent) =="
    # Same gotcha as the legacy smoke.ps1: `dotnet run` execs a child process (the AppHost itself,
    # plus its own Api/Vite children) that doesn't receive the parent's termination -- kill by port.
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalPort -in 5273, 5274, 7210, 17051 } |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
