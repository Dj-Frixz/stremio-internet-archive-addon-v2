let Redis;
try {
    Redis = require('ioredis');
} catch (err) {
    // Dependency might not be installed in some environments
}

const CACHE_URL = process.env.CACHE_REDIS_URL;
const CACHE_ENABLED = process.env.CACHE_ENABLED !== 'false';
const CACHE_BACKEND = CACHE_ENABLED
    ? (CACHE_URL && Redis ? 'Redis with memory fallback' : 'memory')
    : 'disabled';
const DEFAULT_TTL = parseInt(process.env.CACHE_TTL_SECONDS || '1800', 10);
const MAX_MEMORY_ENTRIES = 1000;
const memory = new Map();

let client = null;
let permanentlyDisabled = false;

function getClient() {
    if (!CACHE_ENABLED || !CACHE_URL || !Redis || permanentlyDisabled) {
        return null;
    }
    if (!client) {
        try {
            client = new Redis(CACHE_URL, {
                enableOfflineQueue: false,
                autoResendUnfulfilledCommands: false,
                maxRetriesPerRequest: 1,
                connectTimeout: 1500,
                commandTimeout: 1500,
            });
            client.on('error', (err) => {
                console.warn('[cache] Redis error:', err?.message || err);
            });
        } catch (err) {
            console.warn('[cache] Failed to initialize Redis:', err?.message || err);
            permanentlyDisabled = true;
            return null;
        }
    }
    return client;
}

function readMemory(key) {
    const entry = memory.get(key);
    if (!entry) return null;
    memory.delete(key);
    if (entry.expiresAt <= Date.now()) return null;
    memory.set(key, entry);
    return entry.value;
}

async function cacheGet(key) {
    if (!CACHE_ENABLED) return null;
    const localValue = readMemory(key);
    if (localValue !== null) return localValue;
    const redis = getClient();
    if (redis?.status !== 'ready') {
        return null;
    }
    try {
        const value = await redis.get(key);
        return value ? JSON.parse(value) : null;
    } catch (err) {
        console.warn('[cache] Failed to read key', key, err?.message || err);
        return null;
    }
}

async function cacheSet(key, value, ttlSeconds = DEFAULT_TTL) {
    if (!CACHE_ENABLED) return;
    const ttl = Math.max(1, ttlSeconds);
    if (!Number.isFinite(ttl)) return;
    const redis = getClient();
    if (redis?.status === 'ready') {
        try {
            await redis.set(key, JSON.stringify(value), 'EX', ttl);
            memory.delete(key);
            return;
        } catch (err) {
            console.warn('[cache] Failed to write key', key, err?.message || err);
        }
    }
    memory.delete(key);
    memory.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
    if (memory.size > MAX_MEMORY_ENTRIES) {
        memory.delete(memory.keys().next().value);
    }
}

module.exports = { cacheGet, cacheSet, CACHE_ENABLED, CACHE_BACKEND };
