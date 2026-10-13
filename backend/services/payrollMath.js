// Calendar dates stay local: converting local midnight to ISO can shift a day in IST.
const dateOnly = value => {
    if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
};

const countWeekdays = (start, end, joiningDate = null) => {
    let current = dateOnly(start);
    const last = dateOnly(end);
    if (joiningDate && dateOnly(joiningDate) > current) current = dateOnly(joiningDate);
    let count = 0;
    for (; current <= last; current.setDate(current.getDate() + 1)) {
        if (current.getDay() !== 0 && current.getDay() !== 6) count++;
    }
    return count;
};

const calculateProratedPay = (monthlySalary, cycleDays, eligibleDays, lossOfPayDays) => {
    const rate = cycleDays > 0 ? monthlySalary / cycleDays : 0;
    const eligible = Math.max(0, Math.min(eligibleDays, cycleDays));
    const loss = Math.max(0, Math.min(lossOfPayDays, eligible));
    const basicSalary = Number((eligible * rate).toFixed(2));
    const unpaidDeduction = Number((loss * rate).toFixed(2));
    return { perDaySalary: rate, basicSalary, unpaidDeduction };
};

module.exports = { dateOnly, countWeekdays, calculateProratedPay };
