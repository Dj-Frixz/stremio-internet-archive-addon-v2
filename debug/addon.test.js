const assert = require('node:assert/strict');
const test = require('node:test');

process.env.CACHE_ENABLED = 'true';
delete process.env.CACHE_REDIS_URL;
process.env.CACHE_STALE_AFTER_SECONDS = '0';
process.env.UPSTREAM_CONCURRENCY = '1';

const addon = require('../addon');

const movie = { name: 'Example Movie', year: '1985', runtime: '80 min' };
const episode = { season: 1, episode: 1, name: 'Pilot' };
const series = { name: 'Example Series', year: '1985', videos: [episode] };
const video = { name: 'S01E01.Pilot.mp4', length: 4800, size: '500000000' };

function searchResults(...identifiers) {
    const hits = identifiers.map(identifier => ({ fields: { identifier, title: 'Example' } }));
    return Response.json({ response: { body: { hits: { hits } } } });
}

function stubUpstream(t, { meta = movie, search, files }) {
    return t.mock.method(globalThis, 'fetch', async value => {
        const url = new URL(value);
        if (url.hostname === 'v3-cinemeta.strem.io') {
            return Response.json({ meta });
        }
        assert.equal(url.hostname, 'archive.org');
        if (url.pathname.startsWith('/services/search/')) {
            return search(url);
        }
        assert.match(url.pathname, /^\/metadata\/[^/]+\/files$/);
        return files(url.pathname.split('/')[2]);
    });
}

test('coalesces concurrent lookups and caches the stream result', { timeout: 3000 }, async t => {
    const fetch = stubUpstream(t, {
        search: () => searchResults('cached-movie'),
        files: () => Response.json({ result: [video] }),
    });
    const lookup = () => addon.get('stream', 'movie', 'tt9000010');
    const [result, duplicate] = await Promise.all([lookup(), lookup()]);
    assert.equal(result.streams.length, 1);
    assert.match(result.streams[0].url, /\/cached-movie\//);
    assert.deepEqual(duplicate, result);
    assert.deepEqual(await lookup(), result);
    assert.equal(fetch.mock.callCount(), 3);
});

test('uses broader episode search when narrow results have no matching file', { timeout: 3000 }, async t => {
    const queries = [];
    stubUpstream(t, {
        meta: series,
        search: url => {
            const query = url.searchParams.get('user_query');
            queries.push(query);
            return searchResults(query.includes('*season*1') ? 'narrow-series' : 'broad-series');
        },
        files: identifier => Response.json({
            result: [identifier === 'narrow-series' ? { ...video, name: 'Intro.mp4' } : video],
        }),
    });
    const { streams } = await addon.get('stream', 'series', 'tt9000020:1:1');
    assert.equal(streams.length, 1);
    assert.match(streams[0].url, /\/broad-series\//);
    assert.equal(queries.length, 2);
    assert.match(queries[0], /title:"example\*series\*season\*1"/);
    assert.match(queries[1], /title:\("example\*series" OR \*example\*series\*\)/);
});

test('retries a failed Archive request and caches a successful empty response', { timeout: 3000 }, async t => {
    let searches = 0;
    const fetch = stubUpstream(t, {
        search: () => {
            searches += 1;
            return searches === 1 ? new Response(null, { status: 429 }) : searchResults();
        },
        files: () => assert.fail('An empty search must skip file requests'),
    });
    const lookup = () => addon.get('stream', 'movie', 'tt9000030');
    assert.deepEqual(await lookup(), { streams: [] });
    assert.deepEqual(await lookup(), { streams: [] });
    assert.deepEqual(await lookup(), { streams: [] });
    assert.equal(searches, 2);
    assert.equal(fetch.mock.callCount(), 4);
});
