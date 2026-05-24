# Production API Contract

All endpoints require HTTPS, authenticated sessions, rate limits, request IDs, and structured audit logs for sensitive mutations.

## Common Request Context

Every backend handler receives:

- `actorUserId`
- `actorRoles`
- `sessionId`
- `requestId`
- `ipHash`
- `userAgentHash`
- `relationshipContext`

Every child-data endpoint must check:

- role permission
- relationship permission
- consent scope
- resource visibility
- account state

## Auth and Account

### `GET /me`

Returns current user, roles, linked players, pending approvals, and feature flags.

### `POST /auth/invite-parent`

Creates a parent invitation for a pending child account.

Required body:

```json
{
  "playerUserId": "uuid",
  "parentEmail": "parent@example.com",
  "consentVersion": "2026-05"
}
```

### `POST /guardian/consents`

Grants or withdraws a scoped consent.

Required body:

```json
{
  "playerUserId": "uuid",
  "scope": "performance_tracking",
  "decision": "granted",
  "consentVersion": "2026-05",
  "verificationMethod": "managed_identity_parent_session"
}
```

## Player Profiles

### `GET /players/:playerId`

Returns a profile based on actor relationship and visibility.

### `PATCH /players/:playerId`

Updates safe profile fields.

Parent can update linked child visibility and privacy fields. Player can update display fields only when consent permits.

Allowed body:

```json
{
  "displayName": "Noam L.",
  "position": "CAM",
  "region": "center",
  "visibility": "private"
}
```

## Performance Data

### `POST /players/:playerId/matches`

Requires `performance_tracking` consent.

Body:

```json
{
  "occurredAt": "2026-05-22T15:00:00.000Z",
  "goals": 1,
  "assists": 1,
  "minutes": 72,
  "distanceKm": 8.4,
  "effort": 4,
  "result": "win"
}
```

Response:

```json
{
  "activityId": "uuid",
  "xpAwarded": 78,
  "ratingSnapshot": {
    "ovr": 79,
    "pac": 82,
    "sho": 79,
    "pas": 82,
    "def": 70,
    "phy": 79
  }
}
```

### `POST /players/:playerId/trainings`

Requires `performance_tracking` consent.

Body:

```json
{
  "occurredAt": "2026-05-22T15:00:00.000Z",
  "type": "technical",
  "durationMinutes": 65,
  "focus": "PAS",
  "effort": 4
}
```

### `POST /teams/:teamId/players/:playerId/verify-stat`

Coach can verify only assigned team players with guardian-approved team relationship.

Body:

```json
{
  "activityId": "uuid",
  "status": "verified",
  "notes": "Minutes and result verified from team sheet."
}
```

## Parent Controls

### `GET /parent/children`

Returns linked children, consent status, pending media approvals, and team invitations.

### `PATCH /parent/children/:playerId/privacy`

Body:

```json
{
  "leaderboardParticipation": false,
  "profileVisibility": "private",
  "mediaDefaultVisibility": "private"
}
```

### `POST /parent/children/:playerId/team-invites/:inviteId/decision`

Body:

```json
{
  "decision": "approved"
}
```

## Media Uploads

### `POST /media/upload-intents`

Creates a signed upload URL. Requires `media_upload` consent for minors.

Body:

```json
{
  "playerId": "uuid",
  "category": "match_clip",
  "mimeType": "video/mp4",
  "sizeBytes": 10485760,
  "visibility": "private"
}
```

Response:

```json
{
  "mediaId": "uuid",
  "uploadUrl": "https://storage.example/signed-put",
  "expiresAt": "2026-05-22T16:00:00.000Z",
  "requiredHeaders": {
    "content-type": "video/mp4"
  }
}
```

### `GET /media/:mediaId`

Returns media metadata and approved derivative URLs only if authorized.

### `PATCH /media/:mediaId/visibility`

Parent can approve visibility for linked child media. Moderator approval may still be required.

Body:

```json
{
  "visibility": "team"
}
```

## Leaderboards

### `GET /leaderboards`

Query:

- `scope=region|team|national`
- `sport=football`
- `birthYear=2010`
- `metric=weekly_xp|most_improved|ovr`

Default metric should be `weekly_xp` or `most_improved`, not raw OVR.

## Privacy

### `POST /privacy/export-request`

Creates a data export request for parent or authorized user.

### `POST /privacy/delete-request`

Creates a deletion workflow with identity verification and retention checks.

## Error Shape

```json
{
  "error": {
    "code": "CONSENT_REQUIRED",
    "message": "Guardian consent is required for performance tracking.",
    "requestId": "req_123"
  }
}
```

Recommended error codes:

- `AUTH_REQUIRED`
- `ROLE_FORBIDDEN`
- `RELATIONSHIP_FORBIDDEN`
- `CONSENT_REQUIRED`
- `ACCOUNT_SUSPENDED`
- `VALIDATION_FAILED`
- `MEDIA_POLICY_REJECTED`
- `RATE_LIMITED`
- `NOT_FOUND`
- `SERVER_ERROR`
