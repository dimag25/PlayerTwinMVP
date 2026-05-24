# Player Twin Preview and Staging Deployment

## Preview

Preview is for internal UI review and QA only. It uses demo auth and synthetic JSON storage.

Build and run locally:

```powershell
docker build -t player-twin-preview:local .
docker run --rm -p 8897:8888 --env-file .\deploy\preview.env.example player-twin-preview:local
```

Smoke test:

```powershell
$env:SMOKE_BASE_URL='http://127.0.0.1:8897'
npm run smoke
```

## Staging

Staging requires real infrastructure configuration before it can start:

- Auth0 issuer, audience, and JWKS URL
- PostgreSQL `DATABASE_URL`
- migrations applied with `npm run migrate`
- synthetic seed applied with `npm run seed:postgres`
- HTTPS preview/staging URL in `CORS_ALLOWED_ORIGINS`

Staging intentionally rejects demo auth and JSON storage.

```powershell
$env:DATABASE_URL='postgresql://...'
$env:DATABASE_SSL_MODE='require'
npm run migrate
npm run seed:postgres
docker run --rm -p 8898:8888 --env-file .\deploy\staging.env.example player-twin-preview:local
```

Do not use real minors, real parent data, or real consent records in staging.
