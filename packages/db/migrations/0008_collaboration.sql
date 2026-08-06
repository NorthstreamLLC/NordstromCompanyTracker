-- ============================================================================
-- 0008_collaboration.sql
-- Comments, review requests, notifications, audit log, security events.
--
-- audit_logs and security_events are APPEND-ONLY. No update or delete policy is
-- granted to any role, including workspace owners. An audit trail an actor can
-- edit is not an audit trail.
-- ============================================================================

create table comments (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  -- Polymorphic target: 'transaction' | 'budget' | 'goal' | 'account' | 'report'
  entity_type    text not null,
  entity_id      uuid not null,
  parent_id      uuid references comments(id) on delete cascade,
  body           text not null check (length(trim(body)) > 0),
  mentioned_user_ids uuid[] not null default '{}',
  resolved_at    timestamptz,
  resolved_by    uuid references auth.users(id),
  author_id      uuid not null references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
select app.attach_touch('comments');
create index comments_entity_idx on comments(workspace_id, entity_type, entity_id);

create table review_requests (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  entity_type    text not null,
  entity_id      uuid not null,
  requested_by   uuid not null references auth.users(id),
  requested_of   uuid references auth.users(id),
  message        text,
  status         text not null default 'open' check (status in ('open','resolved','dismissed')),
  resolved_at    timestamptz,
  resolved_by    uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
select app.attach_touch('review_requests');
create index review_requests_ws_idx on review_requests(workspace_id) where status = 'open';

create table notifications (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid references workspaces(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  type           text not null,
  title          text not null,
  body           text,
  entity_type    text,
  entity_id      uuid,
  action_url     text,
  channels       notification_channel[] not null default '{in_app}',
  read_at        timestamptz,
  sent_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, created_at desc);
create index notifications_unread_idx on notifications(user_id) where read_at is null;

create table notification_settings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  workspace_id   uuid references workspaces(id) on delete cascade,
  type           text not null,
  channels       notification_channel[] not null default '{in_app}',
  is_enabled     boolean not null default true,
  threshold_amount numeric(20,4),
  frequency      text not null default 'immediate',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, workspace_id, type)
);
select app.attach_touch('notification_settings');

create table audit_logs (
  id             bigserial primary key,
  workspace_id   uuid references workspaces(id) on delete set null,
  actor_id       uuid references auth.users(id) on delete set null,
  actor_email    text,
  action         text not null,
  entity_type    text not null,
  entity_id      uuid,
  before_state   jsonb,
  after_state    jsonb,
  ip_address     inet,
  user_agent     text,
  created_at     timestamptz not null default now()
);
create index audit_logs_ws_idx on audit_logs(workspace_id, created_at desc);
create index audit_logs_actor_idx on audit_logs(actor_id, created_at desc);
create index audit_logs_entity_idx on audit_logs(entity_type, entity_id);

create table security_events (
  id             bigserial primary key,
  user_id        uuid references auth.users(id) on delete set null,
  event_type     text not null,
  severity       text not null default 'info'
                   check (severity in ('info','warning','critical')),
  ip_address     inet,
  user_agent     text,
  location       text,
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index security_events_user_idx on security_events(user_id, created_at desc);
create index security_events_severity_idx on security_events(severity, created_at desc)
  where severity in ('warning','critical');
