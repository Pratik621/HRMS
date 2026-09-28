import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInFlightGet } from './inFlightGet.js';

test('concurrent matching reads share transport but not mutable response data', async () => {
  let calls = 0;
  const get = createInFlightGet(async () => { calls++; return { data: { items: [2, 1] } }; }, () => 'user-a');
  const [a, b] = await Promise.all([get('/tickets'), get('/tickets')]);
  assert.equal(calls, 1);
  a.data.items.sort();
  assert.deepEqual(b.data.items, [2, 1]);
  await get('/tickets');
  assert.equal(calls, 2, 'manual refresh after settlement must fetch again');
});

test('different URLs, filters and sessions never share requests', async () => {
  let calls = 0;
  let scope = 'user-a';
  const get = createInFlightGet(async () => { calls++; return { data: {} }; }, () => scope);
  const first = get('/tickets');
  const filtered = get('/tickets?manager_id=2');
  scope = 'user-b';
  await Promise.all([first, filtered, get('/tickets')]);
  assert.equal(calls, 3);
});

test('failed reads are removed and can be retried', async () => {
  let calls = 0;
  const get = createInFlightGet(async () => { calls++; throw new Error('offline'); }, () => 'a');
  const results = await Promise.allSettled([get('/tickets'), get('/tickets')]);
  assert.ok(results.every(r => r.status === 'rejected'));
  assert.equal(calls, 1);
  await assert.rejects(get('/tickets'), /offline/);
  assert.equal(calls, 2);
});

test('custom parameters and cancellation are passed through independently', async () => {
  const received = [];
  const get = createInFlightGet(async (url, config) => { received.push(config); return { data: {} }; }, () => 'a');
  const a = { signal: new AbortController().signal };
  const b = { params: { manager: 2 } };
  await Promise.all([get('/tickets', a), get('/tickets', b)]);
  assert.deepEqual(received, [a, b]);
});
