const supabase = require('./config/supabase');

const candidates = [
  'admin_notifications','announcements','attendance','attendance_import_logs','attendance_sessions',
  'birthday_wishes','break_notification_settings','comp_off_earnings','company_holidays','cron_logs',
  'dashboard_posts','employee_breaks','employee_notices','employee_offer_letters','employee_offer_links',
  'employee_onboarding_submissions','employee_ratings','employee_shift_history','employees',
  'fix_balances_log','geofence_settings','housekeeper_access_audit','housekeeper_allowlisted_networks',
  'housekeeper_network_policy','initialization_log','leave_balance','leave_balance_adjustments',
  'leave_balance_archive','leave_balance_backup','leave_requests','leave_transactions','leaves',
  'manager_settings','notice_board','notifications','office_events','overtime_earnings',
  'password_reset_otps','performance_reviews','post_comments','post_follows','regularization_history',
  'regularization_requests','reset_log','salary_deductions','salary_slips','support_tickets',
  'system_logs','team_members','teams','ticket_history','update_requests','update_responses',
  'users','wish_comments',
];

(async () => {
  const hasColumn = [];
  const noColumn = [];
  const noTable = [];
  for (const t of candidates) {
    const { error } = await supabase.from(t).select('employee_id').limit(1);
    if (!error) hasColumn.push(t);
    else if (/does not exist|schema cache/i.test(error.message) && /column/i.test(error.message)) noColumn.push(t);
    else noTable.push(`${t}: ${error.message}`);
  }
  console.log('=== HAS employee_id column ===');
  console.log(hasColumn.join('\n'));
  console.log('\n=== table exists but NO employee_id column ===');
  console.log(noColumn.join('\n'));
  console.log('\n=== other errors (table may not exist) ===');
  console.log(noTable.join('\n'));
})();
