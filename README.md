# Player Twin MVP

Standalone Hebrew RTL clickable demo for a youth football player-card product.

## Run

Open `index.html` directly in a browser, or serve the folder locally:

```powershell
python -m http.server 8765 -d .\sports-card-mvp
```

Then open:

```text
http://127.0.0.1:8765/index.html
```

## Run With Backend Foundation

This repo now includes a dependency-free Node backend demo for auth/roles/consent/API/media-intent behavior:

```powershell
cd .\sports-card-mvp
& "C:\Users\nofar\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" .\server.mjs
```

Or with the local package scripts:

```powershell
cd .\sports-card-mvp
npm run dev
```

Then open:

```text
http://127.0.0.1:8888/index.html
http://127.0.0.1:8888/platform-console.html
```

Demo bearer tokens:

- Player: `demo-player-token`
- Parent: `demo-parent-token`
- Coach: `demo-coach-token`
- Admin: `demo-admin-token`

## Staging / Preview Preparation

The repo includes first-pass DevOps preview artifacts:

- `package.json` with `start`, `dev`, `check`, and `smoke` scripts.
- `.env.example` with placeholder-only preview/staging config.
- `Dockerfile` for a non-root Node runtime.
- `.dockerignore` that excludes local data and secrets.
- `/api/health` for liveness.
- `/api/ready` for preview/staging readiness checks.
- Structured JSON request logs with request IDs.
- Basic CORS, rate limiting, request body limit, and security headers.
- Auth0 JWT validation foundation for strict staging.
- PostgreSQL-backed synthetic app state foundation for strict staging.
- Migration and seed scripts for staging PostgreSQL.
- GitHub Actions CI for Node and Docker validation.
- Manual GitHub Container Registry preview image publishing workflow.

Preview mode is for internal UI/QA review only:

```powershell
$env:APP_ENV='preview'
$env:AUTH_PROVIDER='demo'
$env:DATA_ADAPTER='json'
npm run dev
```

Strict staging/production mode intentionally refuses demo auth and JSON persistence. Do not set `APP_ENV=staging` until managed auth and PostgreSQL are configured.

Staging foundation commands:

```powershell
$env:DATABASE_URL='replace-with-postgresql-url'
$env:DATABASE_SSL_MODE='require'
npm run migrate
npm run seed:postgres
```

Required strict staging settings:

```text
APP_ENV=staging
AUTH_PROVIDER=auth0
DATA_ADAPTER=postgres
AUTH_ISSUER=...
AUTH_AUDIENCE=...
AUTH_JWKS_URL=...
DATABASE_URL=...
CORS_ALLOWED_ORIGINS=...
```

## What This Demo Includes

- Digital football player card with OVR, tier, XP, level, streak, and key stats.
- Match and training update flows with validation.
- Local XP/stat calculation and level-up feedback.
- Leaderboard with privacy-aware display.
- Weekly challenges.
- Privacy controls and parent-approval demo gate.
- Local analytics-style event log.
- JSON export for data-model review.
- Persistence in browser `localStorage` under `sportsMvpState.v1`.
- Optional local backend persistence under `runtime-data/db.json`.

## Explicit Boundaries

This is not a production system for real minors. It now includes an optional local backend foundation for implementation testing, but it is not a hardened cloud backend.

- Standalone mode has no backend.
- Backend-foundation mode uses demo bearer tokens, not real managed auth.
- No real parent verification.
- No real analytics service.
- No production database.
- Media upload intent exists in backend-foundation mode, but it is local demo storage only.
- No public search.
- No chat.

Before a real pilot, add backend storage, role-based access control, legal privacy review, verified guardian consent, audit logs, data deletion/export workflows, and secure analytics.

See `PRODUCTION_ARCHITECTURE.md` for the production backend, auth, roles, media upload, parent controls, and scaling blueprint.

Engineering handoff artifacts:

- `production-handoff/rbac-permissions.md`
- `production-handoff/database-schema.sql`
- `production-handoff/api-contract.md`
- `production-handoff/media-pipeline.md`
- `production-handoff/implementation-roadmap.md`

## QA Checklist

- App loads with no console errors.
- Backend mode on port `8888` can load profile from `/api/players/player_1`.
- Match/training forms submit to API when backend sync is enabled.
- Hebrew RTL layout fits mobile and desktop.
- Match update validates numeric ranges and updates XP/stats.
- Training update validates numeric ranges and updates XP/stats.
- Turning off parent approval blocks new data submissions.
- Leaderboard anonymizes the current player when profile visibility is off.
- Challenge completion awards XP once.
- Privacy toggles persist.
- JSON export downloads current local state.
- Reset demo returns to the default state.
