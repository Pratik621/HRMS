const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateLeaveDays } = require('../config/leavePolicy');

test('frontend and backend agree on weekdays, half days and invalid dates', async () => {
    const frontend = await import('../../frontend/src/utils/leaveDays.js');
    for (const [start, end, duration, expected] of [
        ['2026-10-09', '2026-10-12', 'Full Day', 2],
        ['2026-10-10', '2026-10-11', 'Full Day', 0],
        ['2026-10-12', '2026-10-12', 'Half Day', 0.5],
        ['2026-10-10', '2026-10-10', 'Half Day', 0],
        ['2026-10-12', '2026-10-23', 'Full Day', 10],
        ['2026-12-31', '2027-01-04', 'Full Day', 3],
        ['2026-10-12', '2026-10-09', 'Full Day', 0],
        ['2026-02-30', '2026-03-02', 'Full Day', 0],
    ]) {
        assert.equal(calculateLeaveDays(start, end, duration), expected);
        assert.equal(frontend.calculateLeaveDays(start, end, duration), expected);
    }
});
