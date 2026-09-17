-- backend/scripts/add-last-login-column.sql
-- Backs the Admin "Inactive Logins" tool (see EmployeeList.jsx) which lists employees who
-- haven't logged in for 3+ days (or never have) so an admin can deactivate them from there.
-- No column on `employees` currently tracks this, so it's added here.
--
-- Run this manually against Supabase (this project has no migration runner) before using
-- the "Inactive Logins" feature. Safe to run more than once (IF NOT EXISTS).

alter table employees
  add column if not exists last_login_at timestamptz;
