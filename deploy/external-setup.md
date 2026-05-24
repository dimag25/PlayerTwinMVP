# External Staging Setup

This document is the execution checklist for real external staging. It is intentionally separate from preview because staging must not run demo auth or JSON storage.

## Required External Resources

- Auth0 staging tenant/application/API
- Managed PostgreSQL database
- Hosted container runtime
- GitHub repository secrets/environment variables
- HTTPS staging domain

## Required CLIs

Installed on the local machine:

- GitHub CLI: `gh`
- Auth0 CLI: `auth0`
- Supabase CLI: project-local npm dev dependency, run with `npx supabase` or `npm run supabase -- <args>`

Authentication commands:

```powershell
gh auth login
auth0 login
npx supabase login
```

Non-interactive Supabase automation can also use:

```powershell
$env:SUPABASE_ACCESS_TOKEN='replace-with-token'
npx supabase projects list
```

Do not commit access tokens or CLI profile files.

## GitHub Secrets / Variables

Configure these in the repository or deployment platform. Do not commit real values.

| Name | Type | Required | Notes |
|---|---|---:|---|
| `APP_BASE_URL` | variable | yes | HTTPS staging app URL |
| `PUBLIC_WEB_ORIGIN` | variable | yes | Same as staging app URL unless split web/API |
| `CORS_ALLOWED_ORIGINS` | variable | yes | Strict comma-separated allowlist |
| `AUTH_ISSUER` | variable | yes | Auth0 issuer URL |
| `AUTH_AUDIENCE` | variable | yes | API audience |
| `AUTH_JWKS_URL` | variable | yes | Auth0 JWKS URL |
| `DATABASE_URL` | secret | yes | Managed PostgreSQL URL |
| `DATABASE_SSL_MODE` | variable | yes | `require` for managed DB |
| `RELEASE_SHA` | variable | yes | Set from deploy commit SHA |

## Auth0 Staging

Create:

- API audience matching `AUTH_AUDIENCE`
- SPA/web application for the frontend
- test users only, mapped to synthetic seed subjects
- MFA policy for adult privileged roles before broader staging review

The current backend maps Auth0 `sub` to `users.externalAuthId` in the synthetic PostgreSQL seed.

## PostgreSQL Staging

Run against the managed staging DB:

```powershell
$env:DATABASE_URL='replace-with-managed-postgresql-url'
$env:DATABASE_SSL_MODE='require'
npm run migrate
npm run seed:postgres
```

The current migration creates a synthetic app-state table. This is sufficient for staging foundation validation, not final normalized production persistence.

## Hosted Container

Use the image built by the repository workflow or build directly:

```powershell
docker build -t player-twin-preview:staging .
docker run -p 8888:8888 --env-file .\deploy\staging.env.example player-twin-preview:staging
```

For a real hosted environment, inject secrets through the platform secret manager and set:

```text
APP_ENV=staging
AUTH_PROVIDER=auth0
DATA_ADAPTER=postgres
MEDIA_SCOPE=profile_images
ENABLE_HSTS=true
```

## Acceptance Checks

- `/api/health` returns `200`
- `/api/ready` returns `200`
- unauthenticated child-data request returns `401`
- Auth0 JWT for provisioned synthetic user can read `/api/players/player_1`
- demo bearer token is rejected
- PostgreSQL contains only synthetic data
- logs contain request IDs and no tokens or signed URLs

## Local Strict-Staging Validation

The repo includes a local validation path that does not need real Auth0 or Supabase credentials:

```powershell
docker compose -f .\compose.staging-foundation.yml up -d postgres
$env:PGPASSWORD='postgres'
$env:DATABASE_URL=("postgresql://postgres:" + $env:PGPASSWORD + "@127.0.0.1:55432/player_twin_staging")
$env:DATABASE_SSL_MODE='disable'
npm run smoke:staging
```

This test:

- starts strict `APP_ENV=staging`
- uses PostgreSQL, not JSON storage
- runs migrations
- seeds synthetic users only
- starts a local JWKS endpoint
- signs an Auth0-style JWT
- verifies `/api/ready`
- verifies authenticated `/api/players/player_1`

GitHub Actions runs the same foundation test with a PostgreSQL service container.

## Blocked Until Values Exist

The current machine has the CLIs installed, but authenticated `gh`, `auth0`, and `supabase` sessions are still required. Real external setup requires either:

- authenticated CLIs installed locally, or
- platform credentials/secrets configured directly in GitHub/hosting provider UI, or
- explicit provider access tokens supplied through a secure channel.
