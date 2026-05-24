# Media Upload and Moderation Pipeline

Media is the riskiest production feature because it can contain minors, locations, identity documents, abuse reports, or copyrighted material. Treat uploads as untrusted until processed and approved.

## Upload Flow

1. Client calls `POST /media/upload-intents`.
2. API verifies auth, role, relationship, active consent, quota, size, category, and MIME type.
3. API creates `media_assets` row with `pending_upload`.
4. API returns signed upload URL.
5. Client uploads directly to private object storage.
6. Storage event enqueues `media.process`.
7. Worker verifies checksum and MIME sniffing.
8. Worker runs malware scan.
9. Worker strips EXIF/GPS metadata.
10. Worker creates derivatives:
    - image thumbnail and display image
    - video thumbnail and compressed playback version
    - document preview image/PDF metadata
11. Worker runs automated moderation.
12. Worker sets status:
    - `needs_parent_approval`
    - `needs_moderation`
    - `approved`
    - `rejected`
    - `quarantined`
13. Parent/moderator approval changes visibility.

## Storage Buckets

| Bucket | Public | Purpose |
|---|---|---|
| `raw-private` | No | Original uploads |
| `processed-private` | No | Processed derivatives before approval |
| `approved-cdn` | Controlled CDN | Approved thumbnails/playback derivatives |
| `quarantine` | No | Malware or severe policy risk |

Original files should never be public.

## Media Categories

| Category | Default Visibility | Approval Needed |
|---|---|---|
| `profile_image` | Private | Parent + moderation |
| `match_clip` | Private | Parent + moderation |
| `training_clip` | Private | Parent + moderation |
| `achievement_document` | Private | Parent |
| `team_document` | Team-only | Club admin + parent if tied to child |
| `sensitive_document` | Parent-only | Strong justification + admin policy |

## File Limits for First Production Pilot

| Type | Max Size | Max Duration | Formats |
|---|---:|---:|---|
| Profile image | 10 MB | N/A | JPEG, PNG, WebP |
| Match/training clip | 250 MB | 3 minutes | MP4, MOV |
| Document | 20 MB | N/A | PDF, JPEG, PNG |

## Safety Requirements

- Block precise GPS metadata.
- Block public access to originals.
- Require parent approval before team/public visibility.
- Require moderation before public/portfolio visibility.
- Keep a review trail in `media_moderation_reviews`.
- Rate-limit upload intents per user/player.
- Disable downloads for child media unless explicitly authorized.
- Use short-lived signed read URLs for private derivatives.

## Worker Jobs

| Job | Trigger | Retry |
|---|---|---|
| `media.process` | storage upload complete | 3 retries |
| `media.scan` | process start | no public access until pass |
| `media.transform.image` | image upload | 3 retries |
| `media.transform.video` | video upload | 3 retries + dead letter |
| `media.moderate` | derivative ready | 3 retries |
| `media.notify_parent` | approval required | 5 retries |
| `media.purge_deleted` | privacy/delete request | audited, no retry loop without alert |

## Status Transitions

```text
pending_upload
  -> uploaded
  -> processing
  -> quarantined
  -> rejected
  -> needs_parent_approval
  -> needs_moderation
  -> approved
  -> deleted
```

Only workers/admin services can move media into `approved`. Client requests can ask for visibility, but cannot approve processing or moderation.
