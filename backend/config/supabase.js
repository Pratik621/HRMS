const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
require('dotenv').config();
const { createSupabaseFetch, parseTimeoutMs, DEFAULT_TIMEOUT_MS, DEFAULT_STORAGE_TIMEOUT_MS } = require('./supabaseFetch');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    const msg = `Missing Supabase credentials — SUPABASE_URL: ${supabaseUrl ? 'OK' : 'MISSING'}, KEY: ${supabaseKey ? 'OK' : 'MISSING'}`;
    console.error('❌', msg);
    throw new Error(msg);
}

// @supabase/realtime-js (>=2.1xx) requires a native `WebSocket` global (Node 22+) and throws at
// construction time otherwise — even though this app never actually uses realtime subscriptions,
// createClient() unconditionally builds a RealtimeClient. Passing the `ws` package as the
// transport avoids that crash entirely and works the same on every Node version, so behavior
// doesn't depend on which Node version happens to be installed/provisioned.
//
// Timeout + retry policy for every Supabase HTTP call — see config/supabaseFetch.js. Header
// timeout defaults to 15s for database (PostgREST) requests and 60s for Storage uploads/downloads;
// override with SUPABASE_FETCH_TIMEOUT_MS / SUPABASE_STORAGE_TIMEOUT_MS (0 disables). Only
// GET/HEAD are retried (once, with jitter, connection failures only). Writes are never retried:
// a connection dropped after Postgres committed would otherwise duplicate the write, and not
// every table has a unique key to absorb that (e.g. attendance has none on employee_id+date).
const supabaseFetch = createSupabaseFetch({
    timeoutMs: parseTimeoutMs(process.env.SUPABASE_FETCH_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    storageTimeoutMs: parseTimeoutMs(process.env.SUPABASE_STORAGE_TIMEOUT_MS, DEFAULT_STORAGE_TIMEOUT_MS),
});

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket },
    global: { fetch: supabaseFetch }
});

console.log('✅ Supabase client initialized');

module.exports = supabase;