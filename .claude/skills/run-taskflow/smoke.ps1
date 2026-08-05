<#
Restores, applies the committed EF Core migration to a fresh local SQLite
database, builds, launches the TaskFlow API, drives it end-to-end over real
HTTP, runs the test suite, then shuts everything down cleanly.

Exit code is non-zero if any step fails.

Usage: pwsh .claude/skills/run-taskflow/smoke.ps1
Run from the repo root (paths below are relative to it).
#>

$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:5274"
$logOut = "$env:TEMP\taskflow-api.log"
$logErr = "$env:TEMP\taskflow-api.err.log"

Write-Host "== restore =="
dotnet restore --nologo
if ($LASTEXITCODE -ne 0) { throw "dotnet restore failed" }
dotnet tool restore
if ($LASTEXITCODE -ne 0) { throw "dotnet tool restore failed (needed for dotnet-ef)" }

# ASPNETCORE_ENVIRONMENT=Development is required here too: appsettings.json (base)
# has no ConnectionStrings:DefaultConnection, only appsettings.Development.json does,
# and Program.cs throws rather than falling back to an anonymous temp DB.
$env:ASPNETCORE_ENVIRONMENT = "Development"

Write-Host "== apply EF Core migrations to the local SQLite database =="
dotnet ef database update --project src/TaskFlow.Infrastructure --startup-project src/TaskFlow.Api
if ($LASTEXITCODE -ne 0) { throw "dotnet ef database update failed" }

Write-Host "== launch TaskFlow.Api =="
$proc = Start-Process -FilePath "dotnet" `
    -ArgumentList "run --project src/TaskFlow.Api --no-launch-profile --urls $baseUrl" `
    -RedirectStandardOutput $logOut -RedirectStandardError $logErr -PassThru -WindowStyle Hidden

try {
    Write-Host "== wait for /health =="
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $r = Invoke-WebRequest -Uri "$baseUrl/health" -UseBasicParsing -TimeoutSec 2
            if ($r.StatusCode -eq 200) { $ready = $true; break }
        } catch {}
        Start-Sleep -Seconds 1
    }
    if (-not $ready) {
        Get-Content $logErr -ErrorAction SilentlyContinue
        throw "server did not become healthy in time"
    }
    Write-Host "server healthy"
    # Startup's own MigrateAsync() (Development-only, see Program.cs) runs again here
    # against the already-migrated DB and no-ops -- "No migrations were applied" in
    # taskflow-api.log -- so the explicit `database update` above and the app's
    # auto-migrate never fight each other.

    Write-Host "== POST /api/projects (create) =="
    $body = @{ name = "Website Redesign"; description = "Q3 marketing site refresh" } | ConvertTo-Json
    $create = Invoke-WebRequest -Uri "$baseUrl/api/projects" -Method Post -ContentType "application/json" -Body $body -UseBasicParsing
    if ($create.StatusCode -ne 201) { throw "expected 201, got $($create.StatusCode)" }
    $created = $create.Content | ConvertFrom-Json
    Write-Host $create.Content
    if (-not $create.Headers.Location) { throw "expected Location header on 201" }

    Write-Host "== GET /api/projects/{id} (read what we just created) =="
    $get = Invoke-WebRequest -Uri "$baseUrl/api/projects/$($created.id)" -UseBasicParsing
    if ($get.StatusCode -ne 200) { throw "expected 200, got $($get.StatusCode)" }
    Write-Host $get.Content

    Write-Host "== GET /api/projects/{random-guid} (404) =="
    try {
        Invoke-WebRequest -Uri "$baseUrl/api/projects/00000000-0000-0000-0000-000000000000" -UseBasicParsing | Out-Null
        throw "expected 404"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw }
        Write-Host "404 as expected"
    }

    Write-Host "== POST /api/projects with no name (400 validation) =="
    try {
        Invoke-WebRequest -Uri "$baseUrl/api/projects" -Method Post -ContentType "application/json" -Body '{"description":"no name"}' -UseBasicParsing | Out-Null
        throw "expected 400"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -ne 400) { throw }
        Write-Host "400 as expected"
    }

    Write-Host "== dotnet build =="
    dotnet build --nologo -v quiet
    if ($LASTEXITCODE -ne 0) { throw "dotnet build failed" }

    Write-Host "== dotnet test =="
    # No --nologo here: this repo's test runner is Microsoft.Testing.Platform (see
    # global.json), not VSTest, and it rejects --nologo as an unknown option
    # (exit code 5) instead of ignoring it.
    dotnet test
    if ($LASTEXITCODE -ne 0) { throw "dotnet test failed" }

    Write-Host "== ALL CHECKS PASSED =="
}
finally {
    Write-Host "== stop server =="
    # `dotnet run` (the PID Start-Process gives us) spawns TaskFlow.Api.exe as a
    # child process and does not forward termination to it -- kill the port's
    # listener directly, or the app (and its lock on the sqlite file) survives.
    Get-NetTCPConnection -LocalPort 5274 -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    Remove-Item src/TaskFlow.Api/taskflow-dev.db, src/TaskFlow.Api/taskflow-dev.db-shm, src/TaskFlow.Api/taskflow-dev.db-wal -ErrorAction SilentlyContinue
}
