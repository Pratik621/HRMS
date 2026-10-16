import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { getTokenExpiryMs, isTokenExpired, watchSessionExpiry } from './sessionExpiry.js';
const tokenFor = exp => 'header.' + Buffer.from(JSON.stringify({ exp })).toString('base64url') + '.signature';

test('session remains valid until the exact nine-hour boundary', () => {
    const token = tokenFor(9 * 60 * 60);
    assert.equal(isTokenExpired(token, 9 * 60 * 60 * 1000 - 1), false);
    assert.equal(isTokenExpired(token, 9 * 60 * 60 * 1000), true);
    assert.equal(getTokenExpiryMs('malformed'), null);
});
test('idle session logs out once when its timer fires', () => {
    let now = 1000, callback, delay, logouts = 0;
    const watcher = watchSessionExpiry(() => tokenFor(3), () => logouts++, {
        now: () => now, setTimer: (fn, ms) => { callback = fn; delay = ms; return 1; }, clearTimer() {},
    });
    assert.equal(delay, 2000);
    assert.equal(logouts, 0);
    now = 3000; callback(); watcher.check();
    assert.equal(logouts, 1);
});
test('resuming a sleeping tab detects expiry without an API call', () => {
    let now = 1000, logouts = 0;
    const watcher = watchSessionExpiry(() => tokenFor(3), () => logouts++, {
        now: () => now, setTimer() {}, clearTimer() {},
    });
    now = 5000; watcher.check();
    assert.equal(logouts, 1);
});
test('cleanup stops callbacks and a replaced token uses its own expiry', () => {
    let now = 1000, token = tokenFor(3), logouts = 0, callback, delay;
    const watcher = watchSessionExpiry(() => token, () => logouts++, {
        now: () => now, setTimer: (fn, ms) => { callback = fn; delay = ms; }, clearTimer() {},
    });
    token = tokenFor(10); now = 3000; callback();
    assert.equal(logouts, 0); assert.equal(delay, 7000);
    watcher.stop(); now = 20000; callback();
    assert.equal(logouts, 0);
});
function clientHarness(token) {
    const stored = new Map([['token', token], ['refreshToken', 'refresh'], ['user', '{}']]);
    const events = [], redirects = [];
    let beforeRequest, onError, refreshCalls = 0;
    const client = { interceptors: {
        request: { use(fn) { beforeRequest = fn; } },
        response: { use(ok, fail) { onError = fail; } },
    } };
    const source = fs.readFileSync(new URL('../config/axios.js', import.meta.url), 'utf8')
        .replace(/^import .*;\r?$/gm, '').replace('import.meta.env.VITE_API_URL', "''")
        .replace('export default axiosInstance;', '');
    vm.runInNewContext(source, {
        axios: { create: () => client, post() { refreshCalls++; throw Error('Must not refresh expired session'); } },
        isTokenExpired, syncServerTime() {},
        localStorage: { getItem: key => stored.get(key), removeItem: key => stored.delete(key) },
        CustomEvent: class { constructor(type) { this.type = type; } },
        window: { dispatchEvent: event => events.push(event.type), location: { pathname: '/admin/employees', replace: path => redirects.push(path) } },
    });
    return { stored, events, redirects, beforeRequest, onError, refreshCalls: () => refreshCalls };
}
test('expired token is cleared and redirected before a protected request', async () => {
    const h = clientHarness(tokenFor(1));
    await assert.rejects(h.beforeRequest({ url: '/api/onboarding/links', headers: {} }), /session expired/);
    assert.equal(h.stored.size, 0);
    assert.deepEqual(h.redirects, ['/login']);
    assert.deepEqual(h.events, ['auth:logout']);
    assert.equal(h.refreshCalls(), 0);
});
test('server-reported expiry redirects without refreshing even with clock skew', async () => {
    const h = clientHarness(tokenFor(Date.now() / 1000 + 3600));
    const error = { config: { url: '/api/auth/verify' }, response: { status: 401, data: { code: 'TOKEN_EXPIRED' } } };
    await assert.rejects(h.onError(error));
    assert.equal(h.stored.size, 0);
    assert.deepEqual(h.redirects, ['/login']);
    assert.equal(h.refreshCalls(), 0);
});
test('bad login and unrelated server errors do not trigger expiry logout', async () => {
    const h = clientHarness(tokenFor(1));
    assert.ok(h.beforeRequest({ url: '/api/auth/login', headers: {} }));
    await assert.rejects(h.onError({ config: { url: '/api/auth/login' }, response: { status: 401, data: {} } }));
    await assert.rejects(h.onError({ config: { url: '/api/employees' }, response: { status: 500, data: {} } }));
    assert.equal(h.stored.size, 3);
    assert.deepEqual(h.redirects, []);
});
