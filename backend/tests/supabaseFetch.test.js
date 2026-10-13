const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { getEventListeners } = require('node:events');
const { createSupabaseFetch, parseTimeoutMs, sleepUnlessAborted } = require('../config/supabaseFetch');

const pendingTimers = () => process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;
const abortListeners = (signal) => getEventListeners(signal, 'abort').length;

const REST_URL = 'https://example.supabase.co/rest/v1/employees?select=id';
const STORAGE_URL = 'https://example.supabase.co/storage/v1/object/documents/a.pdf';
const noSleep = () => Promise.resolve();
const networkError = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });

// Fake fetch: answers after `delayMs` (or never, if null), honours init.signal like real fetch.
const fakeFetch = (plan) => {
    const calls = [];
    const impl = (input, init = {}) => {
        const step = plan[Math.min(calls.length, plan.length - 1)];
        calls.push({ input, init });
        return new Promise((resolve, reject) => {
            const signal = init.signal;
            if (signal?.aborted) return reject(signal.reason ?? Object.assign(new Error('aborted'), { name: 'AbortError' }));
            signal?.addEventListener('abort', () => reject(signal.reason ?? Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
            if (step.error) return reject(step.error());
            if (step.delayMs === null) return; // hang until aborted
            setTimeout(() => resolve(new Response(step.body ?? '[]', { status: step.status ?? 200 })), step.delayMs ?? 0);
        });
    };
    return { impl, calls };
};

describe('timeout', () => {
    test('aborts a request with no response headers within the limit', async () => {
        const { impl, calls } = fakeFetch([{ delayMs: null }]);
        const f = createSupabaseFetch({ fetchImpl: impl, timeoutMs: 50, sleep: noSleep });
        const started = Date.now();
        await assert.rejects(f(REST_URL, { method: 'GET' }), { name: 'TimeoutError', message: /50ms/ });
        assert.ok(Date.now() - started < 1000);
        assert.equal(calls.length, 1, 'a timed-out read is not retried');
    });

    test('a response inside the limit passes through and the timer is cleared', async () => {
        const { impl, calls } = fakeFetch([{ delayMs: 5, status: 200, body: '[1]' }]);
        const f = createSupabaseFetch({ fetchImpl: impl, timeoutMs: 40 });
        const res = await f(REST_URL, { method: 'GET' });
        assert.equal(await res.text(), '[1]');
        await new Promise((r) => setTimeout(r, 80));
        assert.equal(calls[0].init.signal.aborted, false, 'no late abort after the response arrived');
    });

    test('0 disables the timeout and passes init through untouched', async () => {
        const { impl, calls } = fakeFetch([{ delayMs: 0 }]);
        const f = createSupabaseFetch({ fetchImpl: impl, timeoutMs: 0 });
        const init = { method: 'GET', headers: { a: '1' } };
        await f(REST_URL, init);
        assert.equal(calls[0].init, init);
    });

    test('storage requests use the separate, longer storage timeout', async () => {
        const { impl } = fakeFetch([{ delayMs: 60 }]);
        const f = createSupabaseFetch({ fetchImpl: impl, timeoutMs: 20, storageTimeoutMs: 500 });
        const res = await f(STORAGE_URL, { method: 'POST', body: Buffer.alloc(10) });
        assert.equal(res.status, 200);
    });

    test('headers, method and body are forwarded unchanged; only signal is replaced', async () => {
        const { impl, calls } = fakeFetch([{ delayMs: 0 }]);
        const f = createSupabaseFetch({ fetchImpl: impl, timeoutMs: 1000 });
        const headers = new Headers({ apikey: 'k', Authorization: 'Bearer k', Prefer: 'return=representation' });
        const body = JSON.stringify({ a: 1 });
        await f(REST_URL, { method: 'POST', headers, body, duplex: 'half' });
        const sent = calls[0].init;
        assert.equal(sent.headers, headers);
        assert.equal(sent.body, body);
        assert.equal(sent.method, 'POST');
        assert.equal(sent.duplex, 'half');
        assert.ok(sent.signal instanceof AbortSignal);
    });
});

describe('retries', () => {
    test('GET is retried once after a connection failure, with jittered delay', async () => {
        const { impl, calls } = fakeFetch([{ error: networkError }, { delayMs: 0, body: '[2]' }]);
        const delays = [];
        const f = createSupabaseFetch({ fetchImpl: impl, random: () => 0.5, sleep: (ms) => { delays.push(ms); return Promise.resolve(); } });
        const res = await f(REST_URL, { method: 'GET' });
        assert.equal(await res.text(), '[2]');
        assert.equal(calls.length, 2);
        assert.deepEqual(delays, [400]); // 200 + floor(0.5 * 400)
    });

    test('jitter stays within 200–599ms', async () => {
        for (const r of [0, 0.999]) {
            const { impl } = fakeFetch([{ error: networkError }, { delayMs: 0 }]);
            const delays = [];
            const f = createSupabaseFetch({ fetchImpl: impl, random: () => r, sleep: (ms) => { delays.push(ms); return Promise.resolve(); } });
            await f(REST_URL);
            assert.ok(delays[0] >= 200 && delays[0] <= 599, `delay ${delays[0]}`);
        }
    });

    test('a request with no method defaults to GET and is retryable', async () => {
        const { impl, calls } = fakeFetch([{ error: networkError }, { delayMs: 0 }]);
        await createSupabaseFetch({ fetchImpl: impl, sleep: noSleep })(REST_URL);
        assert.equal(calls.length, 2);
    });

    test('HEAD is retried once', async () => {
        const { impl, calls } = fakeFetch([{ error: networkError }, { delayMs: 0 }]);
        await createSupabaseFetch({ fetchImpl: impl, sleep: noSleep })(REST_URL, { method: 'head' });
        assert.equal(calls.length, 2);
    });

    test('a read is retried at most once', async () => {
        const { impl, calls } = fakeFetch([{ error: networkError }]);
        const f = createSupabaseFetch({ fetchImpl: impl, sleep: noSleep });
        await assert.rejects(f(REST_URL, { method: 'GET' }), TypeError);
        assert.equal(calls.length, 2);
    });

    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE', 'post']) {
        test(`${method} is never retried`, async () => {
            const { impl, calls } = fakeFetch([{ error: networkError }, { delayMs: 0 }]);
            const f = createSupabaseFetch({ fetchImpl: impl, sleep: noSleep });
            await assert.rejects(f(REST_URL, { method, body: '{}' }), TypeError);
            assert.equal(calls.length, 1);
        });
    }

    test('an HTTP error response (503) is returned, not retried', async () => {
        const { impl, calls } = fakeFetch([{ delayMs: 0, status: 503 }]);
        const res = await createSupabaseFetch({ fetchImpl: impl, sleep: noSleep })(REST_URL, { method: 'GET' });
        assert.equal(res.status, 503);
        assert.equal(calls.length, 1);
    });
});

describe('caller abort signals', () => {
    test('aborting mid-flight rejects with the caller reason, not a timeout, and is not retried', async () => {
        const { impl, calls } = fakeFetch([{ delayMs: null }]);
        const f = createSupabaseFetch({ fetchImpl: impl, timeoutMs: 5000, sleep: noSleep });
        const ac = new AbortController();
        const reason = Object.assign(new Error('user cancelled'), { name: 'AbortError' });
        setTimeout(() => ac.abort(reason), 20);
        await assert.rejects(f(REST_URL, { method: 'GET', signal: ac.signal }), (err) => err === reason);
        assert.equal(calls.length, 1);
    });

    test('an already-aborted signal is honoured immediately and not retried', async () => {
        const { impl, calls } = fakeFetch([{ delayMs: 0 }]);
        const ac = new AbortController();
        ac.abort();
        await assert.rejects(createSupabaseFetch({ fetchImpl: impl, sleep: noSleep })(REST_URL, { signal: ac.signal }), { name: 'AbortError' });
        assert.equal(calls.length, 1);
    });

    test('aborting during the (real) retry delay stops the retry promptly and leaves no timer behind', async () => {
        const { impl, calls } = fakeFetch([{ error: networkError }, { delayMs: 0 }]);
        const ac = new AbortController();
        const before = pendingTimers();
        const started = Date.now();
        setTimeout(() => ac.abort(), 20);
        await assert.rejects(createSupabaseFetch({ fetchImpl: impl, random: () => 0.999 })(REST_URL, { signal: ac.signal }), { name: 'AbortError' });
        assert.ok(Date.now() - started < 150, 'did not wait out the ~600ms delay');
        assert.equal(calls.length, 1);
        assert.equal(pendingTimers(), before, 'retry-delay timer was cleared');
        assert.equal(abortListeners(ac.signal), 0);
    });

    test('caller listener is removed when an attempt fails', async () => {
        const { impl } = fakeFetch([{ error: networkError }]);
        const ac = new AbortController();
        await assert.rejects(createSupabaseFetch({ fetchImpl: impl, sleep: noSleep })(REST_URL, { method: 'POST', signal: ac.signal }));
        assert.equal(abortListeners(ac.signal), 0);
    });

    test('aborting after headers arrived still cancels the body read', async () => {
        const server = http.createServer((req, res) => { res.writeHead(200); res.write('['); /* body never finishes */ });
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        try {
            const ac = new AbortController();
            const f = createSupabaseFetch({ timeoutMs: 1000 });
            const res = await f(`http://127.0.0.1:${server.address().port}/rest/v1/x`, { signal: ac.signal });
            setTimeout(() => ac.abort(), 20);
            await assert.rejects(res.text(), { name: 'AbortError' });
        } finally {
            server.closeAllConnections?.();
            await new Promise((r) => server.close(r));
        }
    });

    test('the caller signal still works when the timeout is disabled', async () => {
        const { impl } = fakeFetch([{ delayMs: null }]);
        const ac = new AbortController();
        setTimeout(() => ac.abort(), 20);
        await assert.rejects(createSupabaseFetch({ fetchImpl: impl, timeoutMs: 0 })(REST_URL, { signal: ac.signal }), { name: 'AbortError' });
    });
});

describe('sleepUnlessAborted', () => {
    test('resolves after the delay and removes its abort listener', async () => {
        const ac = new AbortController();
        await sleepUnlessAborted(10, ac.signal);
        assert.equal(abortListeners(ac.signal), 0);
    });

    test('abort mid-wait rejects immediately, clears the timer and the listener', async () => {
        const ac = new AbortController();
        const before = pendingTimers();
        const p = sleepUnlessAborted(10000, ac.signal);
        assert.equal(pendingTimers(), before + 1);
        ac.abort();
        await assert.rejects(p, { name: 'AbortError' });
        assert.equal(pendingTimers(), before);
        assert.equal(abortListeners(ac.signal), 0);
    });

    test('an already-aborted signal rejects without creating a timer', async () => {
        const ac = new AbortController();
        ac.abort();
        const before = pendingTimers();
        await assert.rejects(sleepUnlessAborted(10000, ac.signal), { name: 'AbortError' });
        assert.equal(pendingTimers(), before);
    });

    test('rejects with the caller-supplied abort reason when it is an Error', async () => {
        const ac = new AbortController();
        const reason = new Error('shutdown');
        const p = sleepUnlessAborted(10000, ac.signal);
        ac.abort(reason);
        await assert.rejects(p, (err) => err === reason);
    });

    test('works without a signal', async () => {
        await sleepUnlessAborted(5);
    });
});

describe('parseTimeoutMs', () => {
    test('unset/empty -> fallback, numbers parsed, 0 allowed, invalid -> fallback', () => {
        assert.equal(parseTimeoutMs(undefined, 15000), 15000);
        assert.equal(parseTimeoutMs('', 15000), 15000);
        assert.equal(parseTimeoutMs('8000', 15000), 8000);
        assert.equal(parseTimeoutMs('0', 15000), 0);
        assert.equal(parseTimeoutMs('abc', 15000), 15000);
        assert.equal(parseTimeoutMs('-5', 15000), 15000);
    });
});

// End-to-end through the real supabase-js client against a local HTTP server: confirms auth
// headers still arrive, a timeout surfaces as { error } (not a throw), and writes hit once.
describe('integration with supabase-js', () => {
    const { createClient } = require('@supabase/supabase-js');
    const WebSocket = require('ws');

    const withServer = async (handler, fn) => {
        const hits = [];
        const server = http.createServer((req, res) => { hits.push({ method: req.method, headers: req.headers }); handler(req, res, hits.length); });
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        try {
            const url = `http://127.0.0.1:${server.address().port}`;
            const client = (opts) => createClient(url, 'test-service-key', {
                auth: { autoRefreshToken: false, persistSession: false },
                realtime: { transport: WebSocket },
                global: { fetch: createSupabaseFetch({ sleep: noSleep, ...opts }) },
            });
            await fn(client, hits);
        } finally {
            server.closeAllConnections?.();
            await new Promise((r) => server.close(r));
        }
    };

    test('select succeeds and apikey/Authorization headers are preserved', async () => {
        await withServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end('[{"id":1}]'); }, async (client, hits) => {
            const { data, error } = await client({ timeoutMs: 2000 }).from('employees').select('id');
            assert.equal(error, null);
            assert.deepEqual(data, [{ id: 1 }]);
            assert.equal(hits[0].headers.apikey, 'test-service-key');
            assert.equal(hits[0].headers.authorization, 'Bearer test-service-key');
        });
    });

    test('a hung query returns { error } with TimeoutError instead of hanging', async () => {
        await withServer(() => { /* never respond */ }, async (client, hits) => {
            const { data, error } = await client({ timeoutMs: 100 }).from('employees').select('id');
            assert.equal(data, null);
            assert.match(error.message, /TimeoutError/);
            assert.equal(hits.length, 1);
        });
    });

    test('timeout covers headers only: a slow body after prompt headers is not cut off', async () => {
        const slowBody = (req, res) => {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.write('[{"id":');
            setTimeout(() => res.end('1}]'), 300); // body finishes 3x past the 100ms limit
        };
        await withServer(slowBody, async (client) => {
            const { data, error } = await client({ timeoutMs: 100 }).from('employees').select('id');
            assert.equal(error, null);
            assert.deepEqual(data, [{ id: 1 }]);
        });
    });

    test('timeout fires when headers are late, even though the body would be quick', async () => {
        const lateHeaders = (req, res) => setTimeout(() => { res.setHeader('content-type', 'application/json'); res.end('[]'); }, 300);
        await withServer(lateHeaders, async (client) => {
            const started = Date.now();
            const { error } = await client({ timeoutMs: 100 }).from('employees').select('id');
            assert.match(error.message, /TimeoutError/);
            assert.ok(Date.now() - started < 280);
        });
    });

    test('dropped connection: select retried once, insert sent once', async () => {
        const dropFirst = (req, res, n) => {
            if (n === 1) return req.socket.destroy();
            res.setHeader('content-type', 'application/json'); res.end('[]');
        };
        await withServer(dropFirst, async (client, hits) => {
            const { error } = await client({ timeoutMs: 2000 }).from('employees').select('id');
            assert.equal(error, null);
            assert.equal(hits.length, 2);
        });
        await withServer(dropFirst, async (client, hits) => {
            const { error } = await client({ timeoutMs: 2000 }).from('attendance').insert({ employee_id: 'X' });
            assert.ok(error, 'insert surfaces the connection error');
            assert.equal(hits.length, 1);
        });
    });
});
