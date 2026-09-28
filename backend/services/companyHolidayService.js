// services/companyHolidayService.js
// HR/Admin-declared company holidays (e.g. an unplanned day off), stored in the
// `company_holidays` table — additive to the static calendar in data/holidays.js, not a
// replacement for it. Every attendance-report / payroll code path that already checks the
// static list via isDateHoliday/getHolidayName must also check this table so a dynamically
// -added holiday gets identical treatment (HOL status, paid day, cron skip).
//
// IMPORTANT: this table already existed in the database before this feature was built (two
// real rows dated 2026-07-03/2026-07-29, created 2026-08-04) with columns
// `id, holiday_date, holiday_name, created_by, created_at` — notably `holiday_name`, not
// `name`, and no `created_by_name` column. This service reads/writes those real column names
// directly and normalizes every result to `{ holiday_date, name, ... }` so every consumer
// (attendanceController.js, salaryController.js, cron/absentEmployeeCheck.js) can keep using
// `.name` without caring about the underlying column name.
const supabase = require('../config/supabase');

// Degrade to "no dynamic holidays" if the table/column isn't there (or PostgREST's schema
// cache hasn't picked up a recent DDL change yet) — same defensive pattern used elsewhere in
// this codebase (e.g. leave_balance_adjustments, attendance_type).

const isMissingTable = (error) => /does not exist|schema cache/i.test(error?.message || '');

// DB row -> the shape every consumer of this service expects.
const toPublicShape = (row) => row && {
  holiday_date: row.holiday_date,
  name: row.holiday_name,
  created_by: row.created_by,
  created_at: row.created_at,
};

class CompanyHolidayService {
  /** The holiday row for a single date, or null if that date isn't a company holiday. */
  static async getHoliday(dateStr) {
    const { data, error } = await supabase
      .from('company_holidays')
      .select('holiday_date, holiday_name, created_by, created_at')
      .eq('holiday_date', dateStr)
      .maybeSingle();
    if (error) {
      if (isMissingTable(error)) return null;
      throw error;
    }
    return toPublicShape(data);
  }

  /** All company holidays whose date falls within [startDateStr, endDateStr] (inclusive). */
  static async getHolidaysInRange(startDateStr, endDateStr) {
    const { data, error } = await supabase
      .from('company_holidays')
      .select('holiday_date, holiday_name')
      .gte('holiday_date', startDateStr)
      .lte('holiday_date', endDateStr);
    if (error) {
      if (isMissingTable(error)) return [];
      throw error;
    }
    return (data || []).map(toPublicShape);
  }

  /** Same as getHolidaysInRange, but as a Set of date strings — the shape most call sites
   *  that just need a fast "is this date a holiday" membership check actually want. */
  static async getHolidayDateSet(startDateStr, endDateStr) {
    const rows = await this.getHolidaysInRange(startDateStr, endDateStr);
    return new Set(rows.map(r => r.holiday_date));
  }

  /** Every company holiday ever recorded, most recent first — for the HOL management UI. */
  static async getAll() {
    const { data, error } = await supabase
      .from('company_holidays')
      .select('holiday_date, holiday_name, created_by, created_at')
      .order('holiday_date', { ascending: false });
    if (error) {
      if (isMissingTable(error)) return [];
      throw error;
    }
    return (data || []).map(toPublicShape);
  }

  /**
   * Mark a date as a company holiday. Throws an Error with `.code === 'DUPLICATE_HOLIDAY'`
   * if that date is already marked — callers should turn that into a 409, not a 500.
   */
  static async create(dateStr, name, createdBy) {
    const existing = await this.getHoliday(dateStr);
    if (existing) {
      const err = new Error(`${dateStr} is already marked as a Holiday.`);
      err.code = 'DUPLICATE_HOLIDAY';
      throw err;
    }

    const payload = {
      holiday_date: dateStr,
      holiday_name: (name && name.trim()) || 'Company Holiday',
      created_by: createdBy || null,
    };

    const { data, error } = await supabase
      .from('company_holidays')
      .insert([payload])
      .select()
      .single();

    if (error) {
      // Unique-constraint violation — a concurrent request won the race between the
      // getHoliday() check above and this insert. (The live table may or may not actually
      // have a unique constraint on holiday_date — the getHoliday() check above is the
      // primary guard either way; this is defense-in-depth if one exists.)
      if (error.code === '23505') {
        const err2 = new Error(`${dateStr} is already marked as a Holiday.`);
        err2.code = 'DUPLICATE_HOLIDAY';
        throw err2;
      }
      throw error;
    }
    return toPublicShape(data);
  }
}

module.exports = CompanyHolidayService;
