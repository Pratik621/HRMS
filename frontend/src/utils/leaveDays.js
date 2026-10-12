// Count inclusive weekdays in UTC, independent of timezone and DST.
function calculateLeaveDays(startDate, endDate = startDate, duration = 'Full Day') {
    const parse = value => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
        const date = new Date(value + 'T00:00:00Z');
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
    };
    const start = parse(startDate);
    const end = parse(endDate || startDate);
    if (!start || !end || start > end) return 0;
    if (duration === 'Half Day') return [0, 6].includes(start.getUTCDay()) ? 0 : 0.5;
    let days = 0;
    for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
        if (![0, 6].includes(date.getUTCDay())) days++;
    }
    return days;
}

export { calculateLeaveDays };
