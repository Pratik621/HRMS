import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, Fragment } from 'react';
import { filterTableRows, tableSearchText } from './tableSearch.js';
const row = (key, name, department) => h('tr', { key }, h('td', null, h('strong', null, name)), h('td', null, department));
const rows = [row('one', 'Sunny Jadhav', 'IT'), row('two', 'Komal Patil', 'HR')];
test('matches case-insensitive text across nested cells and multiple words', () => {
    assert.deepEqual(filterTableRows(rows, ' SUNNY   IT '), [rows[0]]);
    assert.deepEqual(filterTableRows(rows, 'hr patil'), [rows[1]]);
    assert.deepEqual(filterTableRows(rows, 'Sunny HR'), []);
});
test('empty search restores all records and search includes rows beyond page one', () => {
    const many = Array.from({ length: 25 }, (_, index) => row(index, 'Employee ' + index, 'IT'));
    assert.equal(filterTableRows(many, '  '), many);
    assert.deepEqual(filterTableRows(many, 'Employee 24'), [many[24]]);
});
test('search reads badge text, dates and numbers without invoking components', () => {
    const Badge = () => { throw Error('Do not execute components during search'); };
    const item = h('tr', null, h('td', null, h(Badge, null, 'Approved')), h('td', null, '19 Oct 2026'), h('td', null, 44));
    assert.deepEqual(filterTableRows([item], 'approved 2026 44'), [item]);
});
test('search ignores hidden attributes, password values and action labels', () => {
    const item = h('tr', { title: 'secret' }, h('td', null, 'Visible'), h('td', null,
        h('input', { type: 'password', value: 'private' }),
        h('button', null, 'Delete'), h('span', { 'aria-hidden': true }, 'hidden')));
    for (const query of ['secret', 'private', 'Delete', 'hidden']) assert.deepEqual(filterTableRows([item], query), []);
});
test('grouped rows retain their React identity and input values are searchable', () => {
    const group = h(Fragment, { key: 'group' }, row('main', 'Sunny', 'IT'), h('tr', null, h('td', null, h('input', { value: 'Flexible' }))));
    assert.equal(filterTableRows([group], 'Flexible')[0], group);
    assert.equal(tableSearchText(null), '');
});
