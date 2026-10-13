// Single source of truth for the payroll cycle boundary and late-attendance policy.
// Company policy: 26th of previous month through 25th of selected month, inclusive.

const CYCLE_START_DAY = 26;
const CYCLE_END_DAY = 25;
const PAYMENT_DAY = 6;
const LATE_FREE_COUNT = 3;

// Parse date string YYYY-MM-DD as local date (avoid UTC shift)
function parseLocalDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function getCycleDates(month, year) {
    const startMonth = month - 1;
    const startYear = startMonth === 0 ? year - 1 : year;
    const actualStartMonth = startMonth === 0 ? 12 : startMonth;

    const pad = (n) => String(n).padStart(2, '0');
    const startDateStr = `${startYear}-${pad(actualStartMonth)}-${pad(CYCLE_START_DAY)}`;
    const endDateStr = `${year}-${pad(month)}-${pad(CYCLE_END_DAY)}`;

    return {
        startDate: parseLocalDate(startDateStr),
        endDate: parseLocalDate(endDateStr),
        startDateStr,
        endDateStr,
        startMonth: actualStartMonth,
        startYear: startYear,
        endMonth: month,
        endYear: year
    };
}

module.exports = {
    CYCLE_START_DAY,
    CYCLE_END_DAY,
    PAYMENT_DAY,
    LATE_FREE_COUNT,
    getCycleDates,
    parseLocalDate,
};
