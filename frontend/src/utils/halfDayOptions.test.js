import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getHalfDayOptions } from './halfDayOptions.js';
test('overnight assigned shift splits at midnight-aware midpoint', () => {
 const options = getHalfDayOptions('3:00 PM - 12:00 AM');
 assert.equal(options[0].label, 'First Half (3:00 PM - 7:30 PM)');
 assert.equal(options[1].label, 'Second Half (7:30 PM - 12:00 AM)');
 assert.deepEqual(options.map(o => o.value), ['first_half', 'second_half']);
});
test('different shifts, 24-hour times and year-independent midnight splits', () => {
 assert.equal(getHalfDayOptions('09:00 - 18:00')[0].label, 'First Half (9:00 AM - 1:30 PM)');
 assert.equal(getHalfDayOptions('10 PM – 7 AM')[0].label, 'First Half (10:00 PM - 2:30 AM)');
 assert.equal(getHalfDayOptions('12 AM - 9 AM')[1].label, 'Second Half (4:30 AM - 9:00 AM)');
});
test('missing, flexible, malformed and zero-length shifts omit misleading times', () => {
 for (const shift of [null, '', 'Flexible', '25:00 - 18:00', '9:60 AM - 6 PM', '0 AM - 9 AM', '9 AM - 9 AM']) {
  assert.deepEqual(getHalfDayOptions(shift).map(o => o.label), ['First Half', 'Second Half']);
 }
});
