# RBAC and Relationship Permissions

Production authorization must combine global role, relationship, consent scope, and resource visibility. A user being a `coach` or `parent` is never enough by itself.

## Roles

| Role | Purpose | MFA |
|---|---|---|
| `player` | Youth athlete using the product | Optional initially |
| `parent` | Guardian controlling linked player accounts | Recommended |
| `coach` | Team/academy staff verifying performance data | Required |
| `club_admin` | Manages club teams, coaches, and roster invites | Required |
| `moderator` | Reviews media, reports, and safety events | Required |
| `support_admin` | Handles support workflows with limited data access | Required |
| `super_admin` | Break-glass internal role | Required + hardware key |
| `scout` | Future restricted discovery role | Required |

## Consent Scopes

| Scope | Required For |
|---|---|
| `profile_basic` | Player account activation |
| `performance_tracking` | Match/training updates and rating snapshots |
| `leaderboard_participation` | Regional/national leaderboard inclusion |
| `media_upload` | Uploading profile images, clips, documents |
| `team_sharing` | Coach/team roster visibility |
| `public_portfolio` | Any public profile or shareable portfolio |
| `scout_discovery` | Future scout/club discovery |
| `analytics_optional` | Non-essential product analytics |

## Permission Matrix

| Action | Player | Parent | Coach | Club Admin | Moderator | Support Admin | Super Admin |
|---|---|---|---|---|---|---|---|
| View own private card | Own account | Linked child | Team player if approved | Club player if approved | No | Support case only | Yes |
| Update match/training | Own account + consent | Linked child | No | No | No | No | No |
| Verify stat | No | No | Assigned team player | No | No | No | Yes |
| Change child privacy | No | Linked child | No | No | No | No | Yes |
| Approve media visibility | No | Linked child | No | No | Moderation approval only | No | Yes |
| Invite player to team | No | No | Own team | Club team | No | No | Yes |
| Accept team invite | No | Linked child | No | No | No | No | Yes |
| View sensitive documents | No | Linked child | No | No | Safety case only | Support case only | Yes |
| Export child data | No | Linked child | No | No | No | Support assist only | Yes |
| Delete child account | No | Linked child | No | No | No | Support assist only | Yes |
| Suspend account | No | No | No | No | Yes | No | Yes |
| Manage global roles | No | No | No | No | No | No | Yes |

## Authorization Rules

- Deny by default.
- Require active session for every API call.
- Require role check and relationship check for every child-data read/write.
- Require active guardian consent for every child-data processing scope.
- Require audit log for consent, visibility, media, admin, support, and deletion actions.
- Never expose precise location, private media originals, or sensitive documents through public URLs.
- Never allow open search over minor profiles in v1.

## Relationship Checks

| Relationship | Source Table | Valid States |
|---|---|---|
| Parent-child | `guardian_links` | `active` |
| Coach-player | `team_memberships` + `coach_assignments` | `active`, `guardian_approved` |
| Club-player | `team_memberships` + `clubs` | `active`, `guardian_approved` |
| Moderator-resource | moderation queue assignment | `assigned`, `escalated` |
| Support-resource | support case assignment | `open`, `escalated` |

## Admin Guardrails

- Admins cannot silently impersonate users.
- All admin reads of private child data require reason codes.
- Support access should be time-limited to an open support case.
- Moderators see only the media/report context needed for review.
- `super_admin` actions should trigger security alerts.
