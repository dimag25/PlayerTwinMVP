-- Player Twin production schema draft
-- PostgreSQL 15+
-- This is an implementation handoff draft, not a final migration.

create extension if not exists "pgcrypto";

create type user_role as enum (
  'player',
  'parent',
  'coach',
  'club_admin',
  'moderator',
  'support_admin',
  'super_admin',
  'scout',
  'brand_partner'
);

create type account_state as enum (
  'pending_parent_consent',
  'active_private',
  'active_team_visible',
  'active_public_portfolio',
  'suspended',
  'deleted_pending_retention'
);

create type consent_scope as enum (
  'profile_basic',
  'performance_tracking',
  'leaderboard_participation',
  'media_upload',
  'team_sharing',
  'public_portfolio',
  'scout_discovery',
  'analytics_optional'
);

create type consent_status as enum ('granted', 'withdrawn', 'expired');
create type activity_type as enum ('match', 'training', 'challenge');
create type data_source as enum ('self_reported', 'coach_verified', 'club_imported', 'wearable_imported', 'admin_corrected');
create type verification_status as enum ('unverified', 'pending', 'verified', 'rejected');
create type media_status as enum ('pending_upload', 'uploaded', 'processing', 'needs_parent_approval', 'needs_moderation', 'approved', 'rejected', 'quarantined', 'deleted');
create type media_category as enum ('profile_image', 'match_clip', 'training_clip', 'achievement_document', 'team_document', 'sensitive_document');
create type visibility_level as enum ('private', 'parent_only', 'team', 'leaderboard_alias', 'public_portfolio');
create type privacy_request_type as enum ('export', 'delete', 'rectify', 'withdraw_consent');
create type privacy_request_status as enum ('submitted', 'verifying', 'processing', 'completed', 'rejected');

create table users (
  id uuid primary key default gen_random_uuid(),
  external_auth_id text unique not null,
  email text,
  phone text,
  display_name text not null,
  state account_state not null default 'pending_parent_consent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table user_roles (
  user_id uuid not null references users(id),
  role user_role not null,
  granted_by uuid references users(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, role, granted_at)
);

create table player_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references users(id),
  display_name text not null,
  birth_year int not null check (birth_year between 1990 and 2100),
  sport text not null default 'football',
  position text not null,
  region text not null,
  dominant_side text,
  visibility visibility_level not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table guardian_links (
  id uuid primary key default gen_random_uuid(),
  guardian_user_id uuid not null references users(id),
  player_user_id uuid not null references users(id),
  status text not null check (status in ('pending', 'active', 'revoked')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  revoked_at timestamptz,
  unique (guardian_user_id, player_user_id)
);

create table guardian_consents (
  id uuid primary key default gen_random_uuid(),
  guardian_link_id uuid not null references guardian_links(id),
  scope consent_scope not null,
  status consent_status not null,
  consent_version text not null,
  verification_method text not null,
  evidence_ref text,
  ip_hash text,
  user_agent_hash text,
  granted_at timestamptz,
  withdrawn_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text not null,
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id),
  name text not null,
  sport text not null default 'football',
  birth_year int,
  created_at timestamptz not null default now()
);

create table coach_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references users(id),
  team_id uuid not null references teams(id),
  status text not null check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  unique (coach_user_id, team_id)
);

create table team_memberships (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references player_profiles(id),
  team_id uuid not null references teams(id),
  status text not null check (status in ('invited', 'guardian_approved', 'active', 'left', 'revoked')),
  invited_by uuid references users(id),
  guardian_approved_by uuid references users(id),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (player_profile_id, team_id)
);

create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references player_profiles(id),
  activity_type activity_type not null,
  occurred_at timestamptz not null,
  source data_source not null default 'self_reported',
  verification verification_status not null default 'unverified',
  payload jsonb not null,
  confidence_score numeric(4,3) not null default 0.300 check (confidence_score between 0 and 1),
  submitted_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table stat_verifications (
  id uuid primary key default gen_random_uuid(),
  activity_log_id uuid not null references activity_logs(id),
  verifier_user_id uuid not null references users(id),
  status verification_status not null,
  notes text,
  created_at timestamptz not null default now()
);

create table player_ratings (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references player_profiles(id),
  ovr int not null check (ovr between 1 and 99),
  pac int check (pac between 1 and 99),
  sho int check (sho between 1 and 99),
  pas int check (pas between 1 and 99),
  def int check (def between 1 and 99),
  phy int check (phy between 1 and 99),
  confidence_score numeric(4,3) not null default 0.300 check (confidence_score between 0 and 1),
  calculated_from_activity_id uuid references activity_logs(id),
  calculated_at timestamptz not null default now()
);

create table xp_ledger (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references player_profiles(id),
  activity_log_id uuid references activity_logs(id),
  xp_delta int not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_player_profile_id uuid references player_profiles(id),
  uploaded_by uuid not null references users(id),
  category media_category not null,
  status media_status not null default 'pending_upload',
  visibility visibility_level not null default 'private',
  original_object_key text not null,
  derivative_manifest jsonb not null default '{}'::jsonb,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text,
  moderation_summary jsonb not null default '{}'::jsonb,
  parent_approved_by uuid references users(id),
  parent_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table media_moderation_reviews (
  id uuid primary key default gen_random_uuid(),
  media_asset_id uuid not null references media_assets(id),
  reviewer_user_id uuid references users(id),
  status media_status not null,
  reason text,
  created_at timestamptz not null default now()
);

create table leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('region', 'team', 'national')),
  sport text not null,
  birth_year int,
  metric text not null,
  generated_at timestamptz not null default now(),
  entries jsonb not null
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users(id),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  reason_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table privacy_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references users(id),
  player_profile_id uuid references player_profiles(id),
  request_type privacy_request_type not null,
  status privacy_request_status not null default 'submitted',
  verification_ref text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  player_profile_id uuid references player_profiles(id),
  event_name text not null,
  event_version text not null default '1.0',
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_player_profiles_user on player_profiles(user_id);
create index idx_guardian_links_player on guardian_links(player_user_id);
create index idx_guardian_consents_scope on guardian_consents(guardian_link_id, scope, status);
create index idx_activity_player_time on activity_logs(player_profile_id, occurred_at desc);
create index idx_ratings_player_time on player_ratings(player_profile_id, calculated_at desc);
create index idx_media_owner_status on media_assets(owner_player_profile_id, status);
create index idx_audit_resource on audit_logs(resource_type, resource_id, created_at desc);
create index idx_events_user_time on product_events(user_id, created_at desc);
