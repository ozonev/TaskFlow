# PreToolUse hook for Bash|PowerShell. Reinforcement, not the primary control -- providers.tf
# already hardcodes subscription_id/tenant_id, so this only catches running terraform
# somewhere/against something unintended in the first place. See docs/architecture/preview-guardrails.md.

$ErrorActionPreference = "Stop"

$ApprovedRelativeDirs = @("infra/preview/platform", "infra/preview/application")
$TerraformSubcommands = 'plan|apply|destroy|init|import|taint|untaint|force-unlock|state|workspace'

function Write-HookBlock {
    param([string]$Message)
    [Console]::Error.WriteLine("BLOCKED: $Message")
    exit 2
}

function ConvertTo-WindowsPath {
    param([string]$Path)
    # Git Bash-style paths (/c/develop/...) aren't understood by PowerShell's filesystem
    # provider as-is -- translate to a Windows drive path first.
    if ($Path -match '^/([a-zA-Z])/(.*)$') {
        return "$($Matches[1]):/$($Matches[2])"
    }
    return $Path
}

function Get-NormalizedPath {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $null
    }
    try {
        $resolved = (Resolve-Path -LiteralPath (ConvertTo-WindowsPath $Path) -ErrorAction Stop).ProviderPath
    }
    catch {
        return $null
    }
    return ($resolved -replace '/', '\').TrimEnd('\').ToLowerInvariant()
}

function Resolve-EffectiveDirectory {
    param([string]$Command, [string]$Cwd)

    $relativeOrAbsolute = $null
    # terraform's own -chdir flag is the most reliable signal when present.
    if ($Command -match '-chdir[= ]"?([^\s"&|;]+)"?') {
        $relativeOrAbsolute = $Matches[1]
    }
    # A leading `cd <path> &&` (bash), `cd <path>;`/`Set-Location <path>;` (PowerShell), or
    # `cd <path>` on its own line followed by the terraform invocation on the next.
    elseif ($Command -match '^\s*(?:cd|Set-Location)\s+"?([^\s"&|;]+)"?\s*(?:&&|;|\r?\n)') {
        $relativeOrAbsolute = $Matches[1]
    }
    else {
        return $Cwd
    }

    # A relative path (no drive letter, no leading /) is relative to the tool call's own
    # cwd, not to whatever directory this hook process happens to start in.
    $windowsCandidate = ConvertTo-WindowsPath $relativeOrAbsolute
    if ($windowsCandidate -match '^[a-zA-Z]:[\\/]' -or $windowsCandidate.StartsWith('\\')) {
        return $windowsCandidate
    }
    return (Join-Path (ConvertTo-WindowsPath $Cwd) $windowsCandidate)
}

function Get-ApprovedAzureContext {
    param([string]$ProjectDir)

    # Single source of truth: read the pin from providers.tf rather than keeping a second,
    # independently-maintained copy of the same two IDs that could silently drift from it.
    $providersPath = Join-Path $ProjectDir 'infra/preview/platform/providers.tf'
    if (-not (Test-Path -LiteralPath $providersPath -PathType Leaf)) {
        return $null
    }
    $content = Get-Content -LiteralPath $providersPath -Raw
    $subMatch = [regex]::Match($content, 'subscription_id\s*=\s*"([^"]+)"')
    $tenantMatch = [regex]::Match($content, 'tenant_id\s*=\s*"([^"]+)"')
    if (-not $subMatch.Success -or -not $tenantMatch.Success) {
        return $null
    }
    return @{ SubscriptionId = $subMatch.Groups[1].Value; TenantId = $tenantMatch.Groups[1].Value }
}

function Get-LastNonBlankLine {
    param([string]$Text)
    # @(...) forces array semantics even when exactly one line survives the filter --
    # otherwise PowerShell unwraps a single-element pipeline result to a plain string, and
    # indexing a string with [-1] returns a character, not the line, breaking .Trim() below.
    $lines = @($Text -split "`r?`n" | Where-Object { $_.Trim() -ne '' })
    if ($lines.Count -eq 0) {
        return ''
    }
    return $lines[-1].Trim()
}

try {
    $rawInput = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($rawInput)) {
        exit 0
    }

    $hookInput = $rawInput | ConvertFrom-Json

    if ($hookInput.tool_name -ne 'Bash' -and $hookInput.tool_name -ne 'PowerShell') {
        exit 0
    }

    $command = $hookInput.tool_input.command
    if ([string]::IsNullOrWhiteSpace($command)) {
        exit 0
    }

    $projectDir = $env:CLAUDE_PROJECT_DIR
    if ([string]::IsNullOrWhiteSpace($projectDir)) {
        Write-HookBlock "CLAUDE_PROJECT_DIR is not set -- cannot verify the target is an approved preview configuration."
    }

    $approved = Get-ApprovedAzureContext -ProjectDir $projectDir
    if (-not $approved) {
        Write-HookBlock "could not read the approved subscription/tenant pin from infra/preview/platform/providers.tf."
    }

    # Independent of the terraform gate below: any az CLI invocation carrying an explicit
    # --subscription flag (e.g. az acr build) must target the approved subscription too.
    if ($command -match '\baz\b.*--subscription[= ]"?([^\s"]+)"?') {
        $suppliedSubscription = $Matches[1]
        if ($suppliedSubscription -ne $approved.SubscriptionId) {
            Write-HookBlock "command targets subscription '$suppliedSubscription', not the approved preview subscription '$($approved.SubscriptionId)'."
        }
    }

    # (?s) so `.` spans newlines -- a multi-line command with `terraform` and its subcommand
    # on separate lines must still be caught. Anchored to a command boundary (start of
    # string, or after cd/&&/;/|) and requires the subcommand as the very next non-flag
    # token, so plain English prose mentioning both words nearby doesn't false-match.
    $terraformInvocation = "(?s)(?:^|[;&|]\s*|\r?\n)\s*terraform(?:\.exe)?\s+(?:-\S+\s+)*($TerraformSubcommands)\b"
    if ($command -notmatch $terraformInvocation) {
        exit 0
    }

    $effectiveDir = Resolve-EffectiveDirectory -Command $command -Cwd $hookInput.cwd
    $normalizedEffectiveDir = Get-NormalizedPath -Path $effectiveDir

    $approvedNormalizedDirs = $ApprovedRelativeDirs | ForEach-Object {
        Get-NormalizedPath -Path (Join-Path $projectDir $_)
    }

    if (-not $normalizedEffectiveDir -or ($approvedNormalizedDirs -notcontains $normalizedEffectiveDir)) {
        Write-HookBlock "terraform commands are only approved in infra/preview/platform or infra/preview/application. Resolved directory: '$effectiveDir'."
    }

    $accountJson = & az account show -o json
    if ($LASTEXITCODE -ne 0) {
        Write-HookBlock "could not read the active Azure CLI context (az account show failed) -- cannot verify subscription/tenant before running terraform."
    }
    $account = $accountJson | ConvertFrom-Json

    if ($account.id -ne $approved.SubscriptionId) {
        Write-HookBlock "active Azure subscription '$($account.id)' does not match the approved preview subscription '$($approved.SubscriptionId)'."
    }
    if ($account.tenantId -ne $approved.TenantId) {
        Write-HookBlock "active Azure tenant '$($account.tenantId)' does not match the approved preview tenant '$($approved.TenantId)'."
    }

    Push-Location -LiteralPath $effectiveDir
    try {
        $workspaceOutput = (& terraform workspace show 2>&1 | Out-String)
    }
    finally {
        Pop-Location
    }
    $workspace = Get-LastNonBlankLine -Text $workspaceOutput
    if ($workspace -ne 'default') {
        Write-HookBlock "terraform workspace '$workspace' is not 'default' -- this project has never adopted named workspaces, so an unexpected one signals state-namespace confusion."
    }

    exit 0
}
catch {
    Write-HookBlock "validate-terraform-target hook failed: $($_.Exception.Message)"
}
