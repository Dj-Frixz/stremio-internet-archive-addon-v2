const pLimitModule = require('p-limit');
const pLimit = pLimitModule.default || pLimitModule;

const concurrency = Math.max(1, parseInt(process.env.UPSTREAM_CONCURRENCY || '6', 10));
const limit = pLimit(concurrency);
const inflight = new Map();

function schedule(fn) {
    return limit(fn);
}

function deduped(key, fn) {
    if (inflight.has(key)) {
        return inflight.get(key);
    }
    const promise = Promise.resolve().then(fn).finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
}

module.exports = { schedule, deduped };
