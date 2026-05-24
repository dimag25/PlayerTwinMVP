param(
  [ValidateSet("staging", "production")]
  [string]$Environment = "staging",

  [string]$Repo = "dimag25/PlayerTwinMVP",

  [string]$EnvFile = ".\deploy\staging.env.example",

  [switch]$AllowPlaceholders
)

$ErrorActionPreference = "Stop"

function Require-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required but was not found on PATH."
  }
}

function Read-DotEnv($Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Env file not found: $Path"
  }

  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $parts = $trimmed -split "=", 2
    if ($parts.Count -ne 2) { continue }
    $values[$parts[0].Trim()] = $parts[1].Trim()
  }
  return $values
}

function Assert-RealValue($Name, $Value) {
  if ($AllowPlaceholders) { return }
  if (-not $Value -or $Value -match "replace-with|example\.invalid|replace-me|REPLACE_ME") {
    throw "$Name still has a placeholder value. Provide a real value or pass -AllowPlaceholders for dry setup testing."
  }
}

Require-Command "gh"
gh auth status | Out-Host

$values = Read-DotEnv $EnvFile
$secretNames = @(
  "DATABASE_URL",
  "AUTH_CLIENT_SECRET",
  "AUTH0_MANAGEMENT_CLIENT_SECRET",
  "SUPABASE_ACCESS_TOKEN",
  "STORAGE_SERVICE_ROLE_KEY",
  "SENTRY_DSN",
  "OTEL_EXPORTER_OTLP_HEADERS"
)

foreach ($name in $values.Keys) {
  $value = $values[$name]
  Assert-RealValue $name $value

  if ($secretNames -contains $name) {
    gh secret set $name --repo $Repo --env $Environment --body $value | Out-Host
  } else {
    gh variable set $name --repo $Repo --env $Environment --body $value | Out-Host
  }
}

Write-Host "Configured GitHub $Environment environment for $Repo."
