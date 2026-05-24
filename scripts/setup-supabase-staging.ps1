param(
  [ValidateSet("staging", "production")]
  [string]$Environment = "staging",

  [Parameter(Mandatory = $true)]
  [string]$ProjectRef,

  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl,

  [string]$DatabaseSslMode = "require",

  [switch]$RunMigrations,

  [switch]$SeedSyntheticData,

  [switch]$ConfirmProduction
)

$ErrorActionPreference = "Stop"

if ($Environment -eq "production") {
  if (-not $ConfirmProduction) {
    throw "Production Supabase setup requires -ConfirmProduction. Do not run production setup until legal/privacy/security approval is complete."
  }
  if ($SeedSyntheticData) {
    throw "Refusing to seed synthetic demo data into production."
  }
}

if (-not (Test-Path -LiteralPath ".\node_modules\.bin\supabase.cmd")) {
  throw "Supabase CLI dependency is missing. Run npm install first."
}

npx supabase projects list | Out-Null
npx supabase link --project-ref $ProjectRef | Out-Host

if ($RunMigrations) {
  $env:DATABASE_URL = $DatabaseUrl
  $env:DATABASE_SSL_MODE = $DatabaseSslMode
  npm run migrate
}

if ($SeedSyntheticData) {
  if ($Environment -ne "staging") {
    throw "Synthetic seed is allowed only for staging."
  }
  $env:DATABASE_URL = $DatabaseUrl
  $env:DATABASE_SSL_MODE = $DatabaseSslMode
  npm run seed:postgres
}

Write-Host "Supabase $Environment setup completed for project $ProjectRef."
