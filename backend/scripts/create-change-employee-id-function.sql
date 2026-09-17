-- backend/scripts/create-change-employee-id-function.sql
-- Backs the Admin "Change Employee ID" tool. employee_id is used as the join key across
-- ~23 tables (attendance, leaves, breaks, ratings, deductions, tickets, etc.) instead of a
-- database foreign key, so simply renaming it on the `employees` row alone would silently
-- orphan that person's entire history everywhere else. This function renames it EVERYWHERE
-- it's stored, in one transaction — either the whole rename lands, or none of it does.
--
-- Table list verified against both the live Supabase schema (every table below actually has
-- an employee_id column) and actual usage in backend/ (every table below is read/written by
-- real routes or services). Two tables that DO have an employee_id column were deliberately
-- left out: leave_balance_backup (zero references anywhere in the app — an orphaned one-off
-- manual backup, not live data) and password_reset_otps (every row is explicitly deleted the
-- moment its reset flow finishes — see routes/authRoutes.js — so there's never a lingering
-- row tied to the employee worth renaming).
--
-- Run this manually against Supabase (this project has no migration runner) before using
-- the "Change Employee ID" feature.

create or replace function change_employee_id(old_id text, new_id text)
returns void
language plpgsql
as $$
begin
  if old_id is null or new_id is null or btrim(old_id) = '' or btrim(new_id) = '' then
    raise exception 'Both the current and new Employee ID are required';
  end if;

  if old_id = new_id then
    raise exception 'New Employee ID must be different from the current one';
  end if;

  if not exists (select 1 from employees where employee_id = old_id) then
    raise exception 'Employee % not found', old_id;
  end if;

  if exists (select 1 from employees where employee_id = new_id) then
    raise exception 'Employee ID % is already in use', new_id;
  end if;

  -- Every table with a real, live-used employee_id column. Children first, `employees`
  -- itself last — safe ordering whether or not a table happens to have a real foreign key
  -- back to employees.
  update attendance               set employee_id = new_id where employee_id = old_id;
  update attendance_sessions      set employee_id = new_id where employee_id = old_id;
  update comp_off_earnings        set employee_id = new_id where employee_id = old_id;
  update dashboard_posts          set employee_id = new_id where employee_id = old_id;
  update employee_breaks          set employee_id = new_id where employee_id = old_id;
  update employee_notices         set employee_id = new_id where employee_id = old_id;
  update employee_offer_letters   set employee_id = new_id where employee_id = old_id;
  update employee_ratings         set employee_id = new_id where employee_id = old_id;
  update employee_shift_history   set employee_id = new_id where employee_id = old_id;
  update leave_balance            set employee_id = new_id where employee_id = old_id;
  update leave_balance_adjustments set employee_id = new_id where employee_id = old_id;
  update leave_balance_archive    set employee_id = new_id where employee_id = old_id;
  update leave_transactions       set employee_id = new_id where employee_id = old_id;
  update leaves                   set employee_id = new_id where employee_id = old_id;
  update notifications            set employee_id = new_id where employee_id = old_id;
  update overtime_earnings        set employee_id = new_id where employee_id = old_id;
  update performance_reviews      set employee_id = new_id where employee_id = old_id;
  update regularization_requests  set employee_id = new_id where employee_id = old_id;
  update salary_deductions        set employee_id = new_id where employee_id = old_id;
  update salary_slips             set employee_id = new_id where employee_id = old_id;
  update team_members             set employee_id = new_id where employee_id = old_id;
  update update_requests          set employee_id = new_id where employee_id = old_id;

  update employees set employee_id = new_id where employee_id = old_id;
end;
$$;
