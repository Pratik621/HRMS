-- backend/scripts/add-marked-left-columns.sql
-- Backs the "Left from the Team" action: a TL/Manager/Admin/HR marks an employee as having
-- left, but their account stays fully active (can still log in, gets paid normally) until
-- scheduled_deactivation_date — the next 25th, matching the 26th-25th salary cycle used
-- across payroll — when a daily cron job (backend/cron/processLeftEmployees.js) deactivates
-- them automatically.
--
-- Run this manually against Supabase (this project has no migration runner) before using
-- the "Left from the Team" feature. Safe to run more than once (IF NOT EXISTS).

alter table employees
  add column if not exists marked_left_at timestamptz,
  add column if not exists marked_left_by text,
  add column if not exists scheduled_deactivation_date date;
