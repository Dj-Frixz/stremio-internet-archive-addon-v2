const metrics = {
    requests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheBypasses: 0,
    upstreamErrors: 0,
};

const intervalMs = parseInt(process.env.METRICS_INTERVAL_MS || '60000', 10);
let reporter = null;

if (intervalMs > 0) {
    reporter = setInterval(() => {
        console.log('[metrics]', JSON.stringify(metrics));
    }, intervalMs);
    reporter.unref?.();
}

function increment(key) {
    if (metrics[key] === undefined) return;
    metrics[key] += 1;
}

module.exports = { increment };
