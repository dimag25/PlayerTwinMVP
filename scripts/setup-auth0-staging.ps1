param(
  [ValidateSet("staging", "production")]
  [string]$Environment = "staging",

  [Parameter(Mandatory = $true)]
  [string]$AppBaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$ApiAudience,

  [Parameter(Mandatory = $true)]
  [string]$AuthDomain,

  [string]$OutputFile = ".\deploy\generated-auth0-staging.env",

  [switch]$ConfirmProduction
)

$ErrorActionPreference = "Stop"

if ($Environment -eq "production" -and -not $ConfirmProduction) {
  throw "Production Auth0 setup requires -ConfirmProduction. Do not run production setup until legal/privacy/security approval is complete."
}

if (-not (Get-Command "auth0" -ErrorAction SilentlyContinue)) {
  throw "auth0 CLI is required but was not found on PATH."
}

auth0 tenants list --json | Out-Null

$safeDomain = $AuthDomain.Trim().TrimEnd("/")
$issuer = "$safeDomain/"
$jwksUrl = "$safeDomain/.well-known/jwks.json"
$apiName = "Player Twin $Environment API"
$appName = "Player Twin $Environment Web"

$apis = auth0 apis list --json | ConvertFrom-Json
$api = $apis | Where-Object { $_.identifier -eq $ApiAudience -or $_.name -eq $apiName } | Select-Object -First 1
if (-not $api) {
  $api = auth0 apis create `
    --name $apiName `
    --identifier $ApiAudience `
    --token-lifetime 3600 `
    --offline-access=false `
    --signing-alg RS256 `
    --json | ConvertFrom-Json
}

$apps = auth0 apps list --json | ConvertFrom-Json
$app = $apps | Where-Object { $_.name -eq $appName } | Select-Object -First 1
if (-not $app) {
  $app = auth0 apps create `
    --name $appName `
    --type spa `
    --callbacks $AppBaseUrl `
    --logout-urls $AppBaseUrl `
    --origins $AppBaseUrl `
    --web-origins $AppBaseUrl `
    --grants code,refresh-token `
    --json | ConvertFrom-Json
} else {
  $app = auth0 apps update $app.client_id `
    --callbacks $AppBaseUrl `
    --logout-urls $AppBaseUrl `
    --origins $AppBaseUrl `
    --web-origins $AppBaseUrl `
    --grants code,refresh-token `
    --json | ConvertFrom-Json
}

$content = @(
  "AUTH_PROVIDER=auth0",
  "AUTH_ISSUER=$issuer",
  "AUTH_AUDIENCE=$ApiAudience",
  "AUTH_JWKS_URL=$jwksUrl",
  "AUTH_CLIENT_ID=$($app.client_id)"
)

Set-Content -LiteralPath $OutputFile -Value $content -Encoding utf8

Write-Host "Auth0 $Environment resources are configured."
Write-Host "Wrote $OutputFile. Review before copying values into GitHub/hosting environment config."
