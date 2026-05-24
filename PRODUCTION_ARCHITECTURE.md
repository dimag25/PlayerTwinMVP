# Player Twin Production Architecture

This document upgrades the current clickable demo into a production-grade platform plan while preserving a staged rollout. The current app remains a local prototype; production requires backend services, identity, verified parental consent, secure media handling, moderation, monitoring, and legal review before onboarding real minors.

## 1. Target Product Shape

Production should become a role-based youth sports platform:

- Player app: profile, digital card, match/training updates, goals, media portfolio, progress history.
- Parent app: consent, privacy controls, child account management, visibility approvals, media approvals, data export/delete.
- Coach portal: team roster, verified stats, private notes, challenges, player progress.
- Admin console: user support, moderation queue, audit logs, role management, abuse handling.
- Scout/club layer later: restricted discovery over consented/verified profiles only.

The first production release should not include open chat, open public search for minors, public media feeds, or scouting marketplace access. Those features require a separate safety design.

## 2. Recommended Production Stack

Preferred v1 stack:

- Frontend: Next.js + TypeScript + Tailwind, deployed on Vercel or similar.
- Backend API: NestJS or Fastify on Node.js with TypeScript.
- Database: PostgreSQL.
- ORM: Prisma or Drizzle.
- Cache/queues: Redis + BullMQ.
- Object storage: S3-compatible storage for images, videos, documents.
- CDN: CloudFront/Cloudflare for transformed media delivery.
- Auth: managed identity provider with MFA support, such as Auth0, Clerk, Cognito, or Firebase Auth.
- Media processing: async worker pipeline for thumbnails, transcodes, virus scan, metadata stripping, and moderation.
- Analytics: privacy-aware product analytics with server-side event collection and strict child-data minimization.
- Observability: structured logs, metrics, traces, error tracking.

Alternative faster path:

- Supabase Auth + PostgreSQL + Storage + Row Level Security for a smaller first production pilot.
- This is faster, but role/consent/media moderation still must be designed carefully.

## 3. Identity, Roles, and Permissions

### Roles

Use role-based access control with explicit relationships.

Core roles:

- `player`: youth athlete account.
- `parent`: guardian account that controls one or more player accounts.
- `coach`: team or academy staff.
- `club_admin`: manages teams, coaches, and roster invitations.
- `moderator`: reviews media, reports, and safety issues.
- `support_admin`: handles account support with limited data access.
- `super_admin`: restricted internal system role.

Future roles:

- `scout`: restricted viewer role for consented, verified profiles.
- `brand_partner`: challenge sponsor role with no access to child PII.

### Relationship model

Permissions should not be based only on global role. They must also depend on the relationship:

- A parent can manage only linked children.
- A coach can view only team players assigned to that coach.
- A club admin can manage only their club.
- A scout can view only opted-in, age-appropriate, approved profile fields.
- Admin actions require audit logging.

### Permission examples

- Player can update self-reported match/training data if guardian consent is active.
- Parent can approve profile visibility, media visibility, leaderboard participation, and coach/team linking.
- Coach can verify stats for players on their roster.
- Coach cannot change guardian consent.
- Moderator can approve/reject media but cannot impersonate users.
- Support admin can trigger account recovery but cannot browse private media unless required for a support case.

## 4. Authentication and Account Lifecycle

### Signup flow

1. User selects role: player, parent, coach.
2. Player enters age band/year group, not full date of birth unless legally required.
3. If under required threshold, app collects only minimal parent contact needed to request consent.
4. Parent creates/claims guardian account.
5. Parent grants scoped consent.
6. Player account becomes active only for approved scopes.

### Guardian consent scopes

Consent should be granular:

- Basic account/profile creation.
- Match/training data collection.
- Leaderboard participation.
- Media upload.
- Coach/team sharing.
- Public/portfolio sharing.
- Scout/club discovery, future only.
- Analytics beyond strictly necessary product telemetry.

Each consent record should include:

- consent version
- scope
- parent user id
- player id
- timestamp
- IP/device metadata
- withdrawal timestamp
- evidence/reference to verification method

### Account states

- `pending_parent_consent`
- `active_private`
- `active_team_visible`
- `active_public_portfolio`
- `suspended`
- `deleted_pending_retention`

Default for minors: private profile, no public media, no open discovery.

## 5. Data Model

Production tables/entities:

- `users`
- `user_roles`
- `player_profiles`
- `guardian_links`
- `guardian_consents`
- `clubs`
- `teams`
- `team_memberships`
- `coach_assignments`
- `player_ratings`
- `activity_logs`
- `stat_verifications`
- `xp_ledger`
- `challenges`
- `challenge_completions`
- `leaderboard_snapshots`
- `media_assets`
- `media_moderation_reviews`
- `documents`
- `visibility_settings`
- `audit_logs`
- `privacy_requests`
- `product_events`

Important design choice:

- Keep raw uploaded media/documents separate from player profile data.
- Keep audit logs append-only.
- Keep XP ledger append-only; never silently mutate history.
- Store derived OVR/rating snapshots separately from raw activity logs.
- Attach `source` and `confidence_score` to performance data.

## 6. Backend Services

### API service

Responsibilities:

- User/session context.
- Role and relationship authorization.
- Profile CRUD.
- Match/training submissions.
- Parent control updates.
- Team/coach invitations.
- Signed upload URL creation.
- Media metadata registration.
- Leaderboard read endpoints.
- Privacy request endpoints.

### Worker service

Responsibilities:

- Image resizing and thumbnail generation.
- Video transcoding.
- Document preview generation.
- Malware scanning.
- EXIF/GPS metadata stripping.
- Automated moderation checks.
- Notification delivery.
- Leaderboard snapshot generation.
- Data export jobs.

### Admin/moderation service

Responsibilities:

- Moderation queue.
- Report handling.
- Account restrictions.
- Audit log review.
- Support tooling.

## 7. Media Uploads: Docs, Images, Videos

Uploads should never go directly through the main API as raw files. Use signed upload URLs.

Flow:

1. Client requests an upload slot with file type, size, category, and owner.
2. Backend checks role, consent, quota, allowed MIME type, and relationship permissions.
3. Backend creates a `media_assets` row with status `pending_upload`.
4. Backend returns signed upload URL.
5. Client uploads directly to object storage.
6. Storage event triggers worker.
7. Worker scans file, strips metadata, generates derivatives, runs moderation, and updates status.
8. Parent/moderator approval may be required before visibility changes.

Allowed categories:

- `profile_image`
- `match_clip`
- `training_clip`
- `medical_or_identity_document` only if absolutely necessary, strongly restricted
- `team_document`
- `achievement_document`

Recommended limits for v1:

- Images: JPEG/PNG/WebP, max 10 MB.
- Videos: MP4/MOV, max 250 MB, max 3 minutes for MVP.
- Documents: PDF/JPEG/PNG, max 20 MB.

Safety defaults:

- Strip EXIF/GPS metadata.
- Private until approved.
- No public URLs for originals.
- Use signed read URLs or CDN URLs for approved derivatives only.
- No direct download of sensitive documents except by authorized parent/admin.

## 8. Parent Control Features

Parent dashboard should include:

- Child profile overview.
- Consent scopes with on/off controls.
- Visibility controls.
- Media approval queue.
- Coach/team connection approvals.
- Leaderboard participation toggle.
- Data export request.
- Delete account/data request.
- Activity summary.
- Notification preferences.

Parent approval gates:

- First account activation.
- Joining a team/coach workspace.
- Any media visibility beyond private.
- Public portfolio creation.
- Scouting/discovery opt-in.
- Sensitive document upload.

Parent notifications:

- New media uploaded.
- Coach/team invite received.
- Visibility setting changed.
- Account accessed from new device.
- Report/moderation event.

## 9. Privacy, Safety, and Compliance

Production must be designed around child safety by default.

Required principles:

- Data minimization.
- Private defaults.
- No precise geolocation display.
- No open search by child name.
- No targeted advertising to minors.
- No public messaging between minors in v1.
- Consent withdrawal must stop processing for affected scopes.
- Provide export and deletion workflows.
- Maintain audit logs for admin and consent actions.

Regulatory signals to design against:

- FTC COPPA guidance says covered operators generally need verifiable parental consent before collecting personal information online from children under 13.
- FTC parental consent guidance emphasizes choosing a method reasonably designed to confirm the consenting person is the parent.
- European Commission GDPR guidance notes specific safeguards for children’s data, including parent/guardian consent in relevant online contexts.
- ICO Children’s Code emphasizes age-appropriate design, privacy-protective defaults, data minimization, geolocation safeguards, profiling limits, and parental controls.
- Israel’s Ministry of Justice notes privacy as a fundamental right under Israeli law and the Protection of Privacy Law.

Legal review is required before launch, especially for Israel, EU/UK, and US availability.

## 10. API Surface for v1

Suggested REST endpoints:

- `POST /auth/invite-parent`
- `POST /guardian/consents`
- `GET /me`
- `GET /players/:playerId`
- `PATCH /players/:playerId`
- `POST /players/:playerId/matches`
- `POST /players/:playerId/trainings`
- `GET /players/:playerId/activities`
- `GET /players/:playerId/ratings`
- `GET /leaderboards`
- `POST /teams/:teamId/invites`
- `POST /teams/:teamId/players/:playerId/verify-stat`
- `POST /media/upload-intents`
- `GET /media/:mediaId`
- `PATCH /media/:mediaId/visibility`
- `POST /privacy/export-request`
- `POST /privacy/delete-request`

All endpoints require:

- authenticated user
- role check
- relationship check
- consent-scope check where child data is involved
- audit entry for sensitive mutations

## 11. Migration From Current Demo

Step 1: Convert standalone app to Next.js.

- Preserve current UI components.
- Move state logic into typed domain modules.
- Replace localStorage writes with API adapters.
- Keep a demo mode using localStorage for sales demos.

Step 2: Add auth and roles.

- Parent/player signup.
- Linked child account.
- Consent gate.
- Private-by-default profile.

Step 3: Add backend core.

- PostgreSQL schema.
- API service.
- XP ledger.
- activity logs.
- ratings snapshots.
- audit logs.

Step 4: Add parent dashboard.

- consent scopes.
- profile visibility.
- leaderboard opt-in.
- media approvals.

Step 5: Add media pipeline.

- signed uploads.
- worker processing.
- moderation statuses.
- parent approval.

Step 6: Add coach portal.

- team invites.
- roster.
- stat verification.
- team challenges.

Step 7: Add controlled discovery.

- only for opted-in, verified, age-appropriate profiles.
- no open search for minors.
- strict scout/club access logs.

## 12. Production Readiness Checklist

Security:

- MFA for admins/coaches.
- Rate limiting.
- Session management.
- CSRF/XSS protections.
- Signed upload/read URLs.
- Object storage private by default.
- Virus scanning.
- Metadata stripping.
- Audit logs.

Privacy:

- Consent versioning.
- Parent withdrawal flow.
- Export/delete requests.
- Data retention policy.
- Privacy policy by jurisdiction.
- Data processing agreements with vendors.

Safety:

- Moderation queue.
- Reporting flow.
- Admin escalation.
- No open chat in v1.
- No precise location.
- No public search of minors.

Reliability:

- Backups.
- Restore tests.
- Background job retries.
- Dead-letter queues.
- Monitoring and alerting.
- Error tracking.

Product analytics:

- Server-side event schema.
- No sensitive free-text analytics.
- Separate analytics identifiers from direct PII.
- Consent-aware tracking.

## 13. First Production MVP Recommendation

Build the first real production release as:

- Player + Parent accounts.
- Guardian consent.
- Private player card.
- Match/training updates.
- XP and stats.
- Parent privacy controls.
- Regional leaderboard with opt-in.
- Image upload for profile avatar only.
- Admin moderation dashboard.
- Basic coach verification only after the parent approves team linking.

Delay until later:

- Video uploads beyond short clips.
- Sensitive documents.
- Public portfolio pages.
- Scout discovery.
- Open search.
- Messaging/chat.
- Marketplace.

## 14. References

## 15. Engineering Handoff Files

- `production-handoff/rbac-permissions.md`: role, relationship, and consent permission matrix.
- `production-handoff/database-schema.sql`: PostgreSQL schema draft for the first production architecture.
- `production-handoff/api-contract.md`: REST API contract and authorization expectations.
- `production-handoff/media-pipeline.md`: signed upload, processing, moderation, and storage pipeline.
- `production-handoff/implementation-roadmap.md`: phased build order and exit criteria.

## 16. References

- FTC COPPA FAQ: https://www.ftc.gov/tips-advice/business-center/guidance/complying-coppa-frequently-asked-questions
- FTC Verifiable Parental Consent: https://www.ftc.gov/business-guidance/privacy-security/verifiable-parental-consent-childrens-online-privacy-rule
- FTC COPPA Six-Step Compliance Plan: https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business
- European Commission GDPR children safeguards: https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/legal-grounds-processing-data/are-there-any-specific-safeguards-data-about-children_en
- ICO Age Appropriate Design Code: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/
- Israel Ministry of Justice Privacy Protection Council: https://www.gov.il/en/departments/units/privacy_protection_council
