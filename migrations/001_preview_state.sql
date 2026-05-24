create table if not exists app_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists app_state_updated_at_idx on app_state (updated_at);
