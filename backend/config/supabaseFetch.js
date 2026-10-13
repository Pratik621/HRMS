// Fetch wrapper used by the Supabase client (see config/supabase.js). Kept in its own module,
// with every dependency injectable, so the timeout/retry policy can be unit-tested without a
// real Supabase project or env vars.
//
// Timeout — what it measures: from the start of an attempt until the response HEADERS arrive.
// That window includes DNS/TCP/TLS setup, sending the request body (uploads), and all server-side
// work — PostgREST only sends headers after the SQL has finished, so slow queries and dead
// connections are covered. It does NOT include reading the response body: once headers arrive the
// timer is cleared, so a large response that is already streaming (e.g. a Storage download) is
// never cut off by it (a stalled body is still bounded by Node's own fetch body timeout).
// The limit is per attempt, not per handler — a route making five sequential queries can take up
// to 5x the limit. It stops the app waiting; it does NOT cancel SQL already running in Postgres
// (that needs a database-side statement_timeout), so a timed-out write may still commit.
//
// Retry: only GET/HEAD, at most once, with jitter, and only when the connection itself failed
// before any HTTP response came back. Never retried: writes (POST/PATCH/PUT/DELETE — the server
// may already have committed them, and e.g. attendance has no unique key to absorb a duplicate
// insert), any HTTP response including 5xx, our own timeout (a slow DB is overloaded — a retry
// only doubles its load), and a caller-initiated abort.

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_STORAGE_TIMEOUT_MS = 60000;
const RETRYABLE_METHODS = new Set(['GET', 'HEAD']);
const MAX_READ_RETRIES = 1;
const RETRY_MIN_DELAY_MS = 200;
const RETRY_JITTER_MS = 400;

// Reads a millisecond value from env: unset/invalid -> fallback, 0 -> timeout disabled.
const parseTimeoutMs = (raw, fallback) => {
    if (raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
        console.warn(`⚠️  [SUPABASE] invalid timeout "${raw}", using ${fallback}ms`);
        return fallback;
    }
    return n;
};

const requestUrl = (input) => (typeof input === 'string' ? input : input?.url || input?.href || String(input));
const requestMethod = (input, init) => String(init?.method || input?.method || 'GET').toUpperCase();

const timeoutError = (ms) => {
    const err = new Error(`Supabase request timed out after ${ms}ms waiting for response headers`);
    err.name = 'TimeoutError';
    return err;
};

const abortError = (signal) => {
    if (signal.reason instanceof Error) return signal.reason;
    const err = new Error('This operation was aborted');
    err.name = 'AbortError';
    return err;
};

// Sleeps for `ms`, or rejects as soon as `signal` aborts. Either way it leaves nothing behind:
// on completion the abort listener is removed; on abort the pending timer is cleared (and the
// `once` listener has already been dropped).
const sleepUnlessAborted = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    let timer;
    const onAbort = () => {
        clearTimeout(timer);
        reject(abortError(signal));
    };
    timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
});

// One attempt with a header timeout. A caller-supplied signal keeps working for the whole
// request, including while the body is read after headers arrive: its listener stays attached
// on success (it is `once`, and is dropped with the signal), and is removed on failure.
// AbortSignal.any() is avoided on purpose (Node 20.3+).
const fetchWithTimeout = (fetchImpl, input, init, timeoutMs) => {
    const callerSignal = init?.signal;
    if (!timeoutMs || callerSignal?.aborted) return fetchImpl(input, init);

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const onCallerAbort = () => controller.abort(callerSignal.reason);
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

    return fetchImpl(input, { ...init, signal: controller.signal }).then(
        (res) => {
            clearTimeout(timer); // headers received — the timeout no longer applies
            return res;
        },
        (err) => {
            clearTimeout(timer);
            callerSignal?.removeEventListener('abort', onCallerAbort);
            throw timedOut ? timeoutError(timeoutMs) : err;
        }
    );
};

const createSupabaseFetch = ({
    fetchImpl = (...args) => fetch(...args),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    storageTimeoutMs = DEFAULT_STORAGE_TIMEOUT_MS,
    random = Math.random,
    sleep = sleepUnlessAborted, // (ms, signal) => Promise; must reject if signal aborts
} = {}) => async (input, init) => {
    const method = requestMethod(input, init);
    const limit = requestUrl(input).includes('/storage/v1/') ? storageTimeoutMs : timeoutMs;
    const canRetry = RETRYABLE_METHODS.has(method);

    for (let attempt = 0; ; attempt++) {
        try {
            return await fetchWithTimeout(fetchImpl, input, init, limit);
        } catch (err) {
            const retryable = canRetry
                && attempt < MAX_READ_RETRIES
                && err.name !== 'TimeoutError'
                && !init?.signal?.aborted;
            if (!retryable) throw err;
            const delay = RETRY_MIN_DELAY_MS + Math.floor(random() * RETRY_JITTER_MS);
            console.warn(`⚠️  [SUPABASE] ${method} failed (${err.message}), retrying once in ${delay}ms`);
            await sleep(delay, init?.signal);
        }
    }
};

module.exports = { createSupabaseFetch, parseTimeoutMs, sleepUnlessAborted, DEFAULT_TIMEOUT_MS, DEFAULT_STORAGE_TIMEOUT_MS };
