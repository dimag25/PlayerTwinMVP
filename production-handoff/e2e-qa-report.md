# E2E QA Report - sports-card-mvp

Date: 2026-05-22  
Role: Agent 2, QA architect  
Scope: Read/test-only, except this report file.

## Environment

- Workspace: `sports-card-mvp` under the shared `AI` workspace
- Backend: `http://127.0.0.1:8888`
- Server status: already running; `/api/health` returned `200` with `schemaVersion: backend-demo-1.0.0`
- Tested URLs:
  - `http://127.0.0.1:8888/index.html`
  - `http://127.0.0.1:8888/platform-console.html`
  - `http://127.0.0.1:8888/api/*`
- Demo tokens used:
  - Player: `demo-player-token`
  - Parent: `demo-parent-token`
  - Coach: `demo-coach-token`
  - Admin: `demo-admin-token`

## Tools And Commands Used

- PowerShell `Invoke-RestMethod` for backend health verification.
- Node runtime at `C:\Users\nofar\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe` with built-in `fetch` for API E2E checks.
- Codex in-app Browser / Playwright runtime for player-app and platform-console UI E2E checks.
- Browser console log capture via `tab.dev.logs({ levels: ["error", "warning"] })`.
- Responsive viewport checks at `390x844`, then viewport reset.

## Pass/Fail Matrix

| Area | Result | Notes |
|---|---:|---|
| Backend health | Pass | `/api/health` returned `200`. |
| Auth tokens | Pass | Missing/invalid token returned `401 AUTH_REQUIRED`; player/parent/coach/admin `/api/me` returned `200`. |
| Role reads | Pass | Player, parent, coach, admin can load linked `player_1` where expected. |
| Role writes | Pass | Coach match/training submissions blocked with `403 RELATIONSHIP_FORBIDDEN`; player/parent allowed where expected. |
| Match/training valid submissions | Pass | API and UI submissions awarded XP and updated ratings/activity state. |
| Match/training validation | Pass | Out-of-range structured JSON payloads returned `400 VALIDATION_FAILED`. |
| Malformed JSON payload | Fail | Returns `500 SERVER_ERROR` and exposes parser details. See F-001. |
| Parent privacy controls | Pass with concern | Parent can save privacy and leaderboard participation. `leaderboard_alias` exposes `displayName`. See F-004. |
| Consent withdrawal/grant | Pass | Withdrawing `performance_tracking` blocks match submission with `403 CONSENT_REQUIRED`; granting restores write path. |
| Leaderboard behavior | Pass with concern | Withdrawn leaderboard participation excludes player; private visibility anonymizes as `Private Player`; alias mode exposes `Noam L.`. |
| Media upload intent | Pass | Valid intent and binary upload succeeded; invalid policy rejected with `400 MEDIA_POLICY_REJECTED`; media consent withdrawal blocks intent. |
| Media upload enforcement | Fail | Upload accepts wrong content-type and one byte over declared size. See F-002 and F-003. |
| Audit logs | Pass | Parent denied with `403 ROLE_FORBIDDEN`; admin loads recent audit entries including consent/media/privacy actions. |
| Player standalone/localStorage mode | Pass | Guardian toggle blocks local submissions; valid local submission updates XP/activity; reset restores card defaults. |
| Player backend API mode | Pass | Load backend profile, player submit, and coach blocked-error UI all worked; no console errors. |
| Platform console UI | Pass | Load `/me`, privacy, consent, performance errors, leaderboard, audit, no-file media error all rendered JSON/errors correctly. |
| Reset behavior | Pass | Local reset restored default OVR `78`, weekly gain `+42 XP`, activity count `2`. |
| Responsive player app | Pass | At `390x844`, player app had no horizontal overflow; bottom nav and card remained in viewport. |
| Responsive platform console | Fail | At `390x844`, document scroll width was `441px` and grid column was `426.4px`, causing horizontal overflow. See F-005. |
| Console warnings/errors | Pass | No browser console warnings/errors observed on player app or platform console during tested flows. |

## Findings

### F-001 - Malformed JSON returns 500 and leaks parser details

Severity: High  
Surface: Backend API error handling

Reproduction:

1. Send malformed JSON to a JSON endpoint:

   ```powershell
   node --input-type=module -e "const res=await fetch('http://127.0.0.1:8888/api/players/player_1/matches',{method:'POST',headers:{authorization:'Bearer demo-player-token','content-type':'application/json'},body:'{bad json'}); console.log(res.status); console.log(await res.text())"
   ```

2. Observe status `500`.

Actual:

```json
{
  "error": {
    "code": "SERVER_ERROR",
    "message": "Expected property name or '}' in JSON at position 1 (line 1 column 2)",
    "requestId": "5d18e333-e3e0-4b13-adda-b3fc8ed79049"
  }
}
```

Expected: `400 VALIDATION_FAILED` or `400 BAD_REQUEST` with a generic invalid JSON message. Parser internals should not be returned as a server error.

### F-002 - Media upload accepts more bytes than declared in upload intent

Severity: High  
Surface: Media upload API

Reproduction:

1. Create an upload intent with `sizeBytes: 12`.
2. PUT `13` bytes to the returned `uploadUrl`.

Actual: Upload returns `200`, stores the asset, and leaves `media.sizeBytes` as `12` even though the uploaded body was `13` bytes.

Expected: Upload should reject any body whose byte length differs from the signed/declared intent size, ideally `400 MEDIA_POLICY_REJECTED` or `413 PAYLOAD_TOO_LARGE`.

### F-003 - Media upload ignores required content-type at upload time

Severity: High  
Surface: Media upload API

Reproduction:

1. Create a `profile_image` upload intent with `mimeType: image/png`.
2. PUT a 12-byte body to the returned `uploadUrl` with header `content-type: text/plain`.

Actual: Upload returns `200` and stores the media as `mimeType: image/png`.

Expected: Upload should enforce the `requiredHeaders.content-type` returned by the intent and reject mismatches.

### F-004 - `leaderboard_alias` exposes backend display name

Severity: Medium  
Surface: Privacy / leaderboard

Reproduction:

1. PATCH parent privacy:

   ```json
   {
     "visibility": "leaderboard_alias",
     "leaderboardParticipation": true
   }
   ```

2. GET `/api/leaderboards?scope=region`.

Actual: Player appears as `displayName: "Noam L."`.

Expected: Because the visibility value is named `leaderboard_alias`, the leaderboard should use a generated alias/pseudonym or a clearly parent-approved public display value. This is especially important for a minors-focused product.

### F-005 - Platform console overflows horizontally on mobile

Severity: Medium  
Surface: Responsive UI

Reproduction:

1. Open `http://127.0.0.1:8888/platform-console.html`.
2. Set viewport to `390x844`.
3. Inspect document dimensions.

Actual:

- `window.innerWidth`: `390`
- `document.documentElement.scrollWidth`: `441`
- `.grid` computed column width: `426.4px`

Expected: No horizontal overflow at mobile widths; scroll width should be less than or equal to viewport width.

## Detailed Scenario Notes

### API E2E

- `/api/health` succeeded without auth.
- `/api/me`:
  - Missing token: `401 AUTH_REQUIRED`
  - Invalid token: `401 AUTH_REQUIRED`
  - Player/parent/coach/admin tokens: `200`
- `/api/players/player_1`:
  - Player/parent/coach/admin tokens: `200`
- Match/training:
  - Coach submit blocked with `403 RELATIONSHIP_FORBIDDEN`.
  - Invalid match and training structured payloads returned `400 VALIDATION_FAILED`.
  - Valid player match returned `201`.
  - Valid parent training returned `201`.
- Consent:
  - Parent withdrew `performance_tracking`; player match was blocked with `403 CONSENT_REQUIRED`.
  - Parent granted `performance_tracking`; player match succeeded again.
  - Parent withdrew `media_upload`; media intent was blocked with `403 CONSENT_REQUIRED`.
  - Parent granted `media_upload`; media intent succeeded again.
- Privacy/leaderboard:
  - Player cannot update parent privacy: `403 RELATIONSHIP_FORBIDDEN`.
  - Parent can disable leaderboard participation; leaderboard returned `players: []`.
  - Parent can re-enable participation; leaderboard included `player_1`.
- Media:
  - Invalid `profile_image` intent with `video/mp4` returned `400 MEDIA_POLICY_REJECTED`.
  - Valid `profile_image` intent returned `201` with local `uploadUrl`.
  - Binary upload returned `200` and status `needs_parent_approval`.
- Audit:
  - Parent denied `/api/audit-logs`: `403 ROLE_FORBIDDEN`.
  - Admin loaded audit logs: `200`, including recent media, consent, privacy, and activity actions.

### Player App UI

- Page loads in Hebrew with `html dir="rtl"` and `lang="he"`.
- No console warnings/errors during load, local mode, backend mode, or mobile checks.
- Standalone/localStorage mode:
  - Backend mode disabled.
  - Guardian approval unchecked.
  - Match submit blocked with the expected Hebrew guardian-approval error.
  - Guardian approval checked.
  - Match submit succeeded; toast showed the expected local success message with `+106 XP`; activity count changed to `3`.
  - Reset restored OVR `78`, weekly gain `+42 XP`, activity count `2`.
- Backend API mode:
  - Backend profile load showed status `Synced from API`.
  - Coach token submit showed `RELATIONSHIP_FORBIDDEN` toast and modal error `You cannot submit for this player.`
  - Player token submit succeeded; toast showed the expected backend success message with `+78 XP`.

### Platform Console UI

- Load `/me` as parent rendered linked player JSON.
- Save privacy as parent rendered updated player/consent JSON.
- Withdraw performance consent rendered `performance_tracking: "withdrawn"`.
- Submit match as player after withdrawal rendered `CONSENT_REQUIRED`.
- Grant performance consent restored `performance_tracking: "granted"`.
- Submit training as coach rendered `RELATIONSHIP_FORBIDDEN`.
- Upload media with no selected file rendered `Choose a file first.`
- Load leaderboard rendered JSON with private player anonymized as `Private Player`.
- Load audit logs as admin rendered recent audit entries.
- No console warnings/errors observed.
