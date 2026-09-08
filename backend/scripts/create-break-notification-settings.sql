-- backend/scripts/create-break-notification-settings.sql
-- "Notify Emails" feature: lets Admin pick which employees to monitor for break
-- overtime, and which email addresses get notified. Run this manually against
-- Supabase (this project has no migration runner) before using the feature.

-- Singleton config row (id is always 1) — one shared configuration for the whole
-- company, matching "reopening the popup shows the previously saved configuration".
create table if not exists break_notification_settings (
  id integer primary key default 1,
  monitored_employee_ids jsonb not null default '[]'::jsonb,
  notify_emails jsonb not null default '[]'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now(),
  constraint break_notification_settings_singleton check (id = 1)
);

insert into break_notification_settings (id)
values (1)
on conflict (id) do nothing;

-- Per-break-session notification tracking — reuses the existing employee_breaks
-- row (one per break) instead of a separate tracking table, so "has an overtime
-- notification already been sent for this break" / "has an ended notification
-- already been sent" are just two nullable timestamps on the row that's already
-- there.
alter table employee_breaks add column if not exists overtime_notified_at timestamptz;
alter table employee_breaks add column if not exists ended_notified_at timestamptz;

create index if not exists idx_employee_breaks_overtime_pending
  on employee_breaks (employee_id, break_type)
  where break_end is null and overtime_notified_at is null;
