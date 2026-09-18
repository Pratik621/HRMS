// backend/utils/employeeId.js
// Single source of truth for generating the next B2B{YY}{MM}{NN} employee_id for a given
// joining date. MAX-based (highest existing NN + 1), not count-based — count-based generation
// (COUNT of rows with this month's prefix, then count+1) silently breaks the moment the
// sequence has any gap, which is now guaranteed after employee_id renames/reassignments: e.g.
// September 2026 has 12 actual rows but the highest in-use NN is 14 (rows were skipped/moved),
// so count-based generation produced "B2B260913" — already taken by another employee —
// causing "duplicate key value violates unique constraint employees_employee_id_key" the
// moment an offer-link candidate (e.g. Sanika Ghorpade, 2026-09-18) submitted their onboarding
// form. MAX-based generation always lands on the true next-free slot regardless of gaps, and
// the existence recheck below is a second safety net in case of a rare race between two
// simultaneous signups landing on the same computed sequence.
const supabase = require('../config/supabase');

const generateNextEmployeeId = async (joiningDate) => {
    const date = new Date(joiningDate);
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `B2B${year}${month}`;

    const { data: employees, error } = await supabase
        .from('employees')
        .select('employee_id')
        .like('employee_id', `${prefix}%`);
    if (error) throw error;

    const sequences = (employees || []).map(emp => {
        const seq = parseInt(emp.employee_id.slice(-2), 10);
        return isNaN(seq) ? 0 : seq;
    });
    const maxSequence = sequences.length > 0 ? Math.max(...sequences) : 0;
    let nextSequence = maxSequence + 1;
    if (nextSequence > 99) {
        throw new Error(`Maximum employees for ${prefix} reached (99)`);
    }

    const employeeId = `${prefix}${String(nextSequence).padStart(2, '0')}`;

    // Recheck-and-recurse safety net (matches the pre-existing behavior in
    // employeeRoutes.js's generator) — covers a rare race between two concurrent inserts.
    const { data: existing, error: checkError } = await supabase
        .from('employees')
        .select('employee_id')
        .eq('employee_id', employeeId)
        .maybeSingle();
    if (checkError) throw checkError;
    if (existing) {
        return generateNextEmployeeId(joiningDate);
    }

    return employeeId;
};

module.exports = { generateNextEmployeeId };
