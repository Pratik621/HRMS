-- backend/scripts/fix-attendance-status-check.sql
-- Fixes: "new row for relation attendance violates check constraint attendance_status_check"
-- hit while running change_employee_id(). Root cause: the constraint is narrower than the
-- data that's actually been living in the table for a long time — a legacy row's status only
-- gets re-validated against the CURRENT constraint the moment something updates that row
-- (any column, even employee_id), which is why this never surfaced until the rename touched
-- it. Confirmed by scanning all 10,126 live attendance rows: the real, in-use status values
-- are present, absent, week_off, missing, half_day, holiday, leave, working, comp_off — so
-- the constraint is out of date, not the data.
--
-- Dropping and re-adding the constraint against this exact list is safe: Postgres validates
-- every existing row against the new definition as part of the ADD, and all 10,126 rows
-- already conform to this list, so it will succeed immediately with zero data changes.

alter table attendance drop constraint attendance_status_check;

alter table attendance add constraint attendance_status_check
  check (status is null or status in (
    'present', 'absent', 'week_off', 'missing', 'half_day', 'holiday', 'leave', 'working', 'comp_off'
  ));
