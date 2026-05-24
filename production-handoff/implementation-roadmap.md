# Production Implementation Roadmap

This roadmap converts the standalone demo into a real platform while avoiding risky child-data features too early.

## Phase 1: Production Foundation

Goal: secure skeleton with real identity and database.

Deliverables:

- Next.js frontend shell.
- Backend API service.
- PostgreSQL database.
- Managed auth provider integration.
- Roles and relationship authorization middleware.
- Audit log infrastructure.
- Basic player and parent accounts.
- Guardian consent table and consent gate.
- Private-by-default player card.

Exit criteria:

- A player cannot submit performance data without active guardian consent.
- A parent can see and manage only linked children.
- Every sensitive mutation writes an audit log.
- No child profile is public by default.

## Phase 2: Core Product

Goal: production version of current demo.

Deliverables:

- Match/training submissions.
- XP ledger.
- Rating snapshots.
- Player activity history.
- Parent privacy controls.
- Regional leaderboard opt-in.
- Server-side product events.

Exit criteria:

- XP history is append-only.
- Ratings are reproducible from activity history.
- Leaderboards exclude non-consented players.
- Parent can withdraw leaderboard consent and removal is reflected in the next snapshot.

## Phase 3: Parent Control Center

Goal: make guardian control a first-class product area.

Deliverables:

- Parent dashboard.
- Consent scope management.
- Team invite approvals.
- Data export request.
- Delete account request.
- Notification preferences.

Exit criteria:

- Parent can approve/revoke every scope independently.
- Consent changes are versioned and audited.
- Export/delete workflows have status tracking.

## Phase 4: Media Upload Pilot

Goal: safe upload system for profile images and short clips.

Deliverables:

- Signed upload URLs.
- Private object storage.
- Worker pipeline.
- Virus scan.
- Metadata stripping.
- Thumbnail/transcode generation.
- Parent approval queue.
- Moderator queue.

Exit criteria:

- Original media is never public.
- Media is private until processed and approved.
- Parent and moderation decisions are audited.
- GPS metadata is stripped before display.

## Phase 5: Coach Portal

Goal: controlled team layer with verification.

Deliverables:

- Club/team models.
- Coach assignments.
- Team invite flow.
- Parent approval for team linking.
- Coach roster.
- Stat verification.
- Team challenges.

Exit criteria:

- Coach sees only guardian-approved team players.
- Coach verification updates confidence score without rewriting raw player submissions.
- Parent can remove team sharing.

## Phase 6: Controlled Discovery

Goal: limited discovery only after safety review.

Deliverables:

- Opt-in public/portfolio profile.
- Scout role.
- Access request workflow.
- Profile field redaction.
- Scout access logs.

Exit criteria:

- No open search over minors.
- Only opted-in, approved, age-appropriate profiles are discoverable.
- Every scout profile view is logged.

## Build Order Recommendation

1. Auth provider decision and app shell migration.
2. PostgreSQL schema and authorization middleware.
3. Parent-player linking and consent.
4. Current demo features backed by API.
5. Parent dashboard.
6. Media pipeline.
7. Coach portal.
8. Discovery only after legal/safety review.

## Do Not Build Yet

- Open chat.
- Public feed.
- Public search by name.
- Scout marketplace.
- Sensitive document upload.
- Unmoderated video sharing.
- Targeted advertising.
