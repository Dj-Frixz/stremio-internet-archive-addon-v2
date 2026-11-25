const { Agent } = require('undici');
const { cacheGet, cacheSet, CACHE_ENABLED } = require('./cache');
const { schedule, deduped } = require('./request-manager');
const { increment } = require('./metrics');

const ACCEPTED_FILE_TYPES = ['avi', 'mp4', 'mkv', 'wmv', 'mov', 'm4v'];
const ACCEPTED_SUBTITLES = ['srt', 'vtt', 'ass'];
const MAX_STREAMS = 5;
const MAX_STREAMS_SERIES = 15;
const SOURCE_LABEL = process.env.STREAM_SOURCE_LABEL || 'Archive.org';

const dispatcher = new Agent({
    keepAliveTimeout: 10_000,
    keepAliveMaxTimeout: 60_000,
    connectTimeout: 15_000,
});

const DEFAULT_STREAM_TTL = Math.max(60, parseInt(process.env.CACHE_STREAM_TTL || '1800', 10));
const NEGATIVE_CACHE_TTL = Math.max(30, parseInt(process.env.CACHE_NEGATIVE_TTL || '120', 10));
const STALE_AFTER_MS = Math.max(0, parseInt(process.env.CACHE_STALE_AFTER_SECONDS || '900', 10) * 1000);
const CACHE_TTL_JITTER = Math.max(0, parseFloat(process.env.CACHE_TTL_JITTER || '0.2'));
const ARCHIVE_FILES_TTL = Math.max(300, parseInt(process.env.CACHE_ARCHIVE_FILES_TTL || '21600', 10));
const ARCHIVE_FILES_EMPTY_TTL = Math.max(60, parseInt(process.env.CACHE_ARCHIVE_FILES_EMPTY_TTL || '600', 10));

const refreshingKeys = new Set();

const sizeToString = (bytes) => bytes >= 1073741824
    ? `${(bytes / 1073741824).toFixed(1)}GB`
    : `${(bytes / 1048576).toFixed(0)}MB`;

const slugifyToken = (value = '') => value
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '');

const buildReleaseSlug = ({
    title,
    year,
    season,
    episode,
    quality,
    resolution,
    codec,
    extension,
}) => {
    const tokens = [];
    const titleToken = slugifyToken(title);
    if (titleToken) tokens.push(titleToken);
    if (year) tokens.push(String(year));
    if (season && episode) {
        const s = String(season).padStart(2, '0');
        const e = String(episode).padStart(2, '0');
        tokens.push(`S${s}E${e}`);
    }
    if (quality) tokens.push(slugifyToken(quality).toUpperCase());
    if (resolution) tokens.push(`${resolution}p`);
    const codecToken = codec || extension;
    if (codecToken) tokens.push(slugifyToken(codecToken).toUpperCase());
    const slugBase = (tokens.filter(Boolean).join('.')) || slugifyToken(title || 'ArchiveOrg');
    const ext = (extension || '').replace(/^\./, '');
    return ext ? `${slugBase}.${ext}` : slugBase;
};

function formatStreamName(sourceTitle, qualityTag, fileMeta) {
    const detailParts = [];
    if (qualityTag) detailParts.push(qualityTag.trim().toUpperCase());
    if (fileMeta?.height) detailParts.push(`${fileMeta.height}p`);
    const fileFormat = (fileMeta?.format || fileMeta?.source || fileMeta?.name?.split('.').pop() || '').toUpperCase();
    if (fileFormat) detailParts.push(fileFormat);
    const suffix = detailParts.length ? ` • ${detailParts.join(' · ')}` : '';
    let emoji = '📼';
    if ((fileMeta?.height || 0) >= 2160) emoji = '🌌';
    else if ((fileMeta?.height || 0) >= 1080) emoji = '🎞️';
    else if ((fileMeta?.height || 0) >= 720) emoji = '📽️';
    return `${emoji} ${SOURCE_LABEL} • ${sourceTitle}${suffix}`;
}

async function limitedFetchJson(url, options = {}) {
    try {
        return await schedule(async () => {
            const res = await fetch(url, { dispatcher, signal: AbortSignal.timeout(20_000), ...options });
            if (!res.ok) {
                await res.body?.cancel();
                throw new Error(`HTTP ${res.status}`);
            }
            return res.json();
        });
    } catch (err) {
        increment('upstreamErrors');
        const { origin, pathname } = new URL(url);
        console.warn('[fetch]', origin + pathname, err?.message || err);
        return null;
    }
}

async function getCinemetaMeta(type, id) {
    return deduped(`cinemeta:${type}:${id}`, async () => {
        const json = await limitedFetchJson(`https://v3-cinemeta.strem.io/meta/${type}/${id}.json`);
        return json?.meta || null;
    });
}

async function searchArchive(queryKey, url) {
    return deduped(`archive:search:${queryKey}`, async () => {
        const json = await limitedFetchJson(url);
        const hits = json?.response?.body?.hits?.hits;
        return Array.isArray(hits) ? hits : null;
    });
}

async function getArchiveFiles(identifier) {
    const cacheKey = `archive:files:${identifier}`;
    if (CACHE_ENABLED) {
        const cached = await cacheGet(cacheKey);
        if (cached) {
            return cached;
        }
    }
    return deduped(`archive:files:${identifier}`, async () => {
        const json = await limitedFetchJson(`https://archive.org/metadata/${identifier}/files`);
        const files = json?.result;
        if (!Array.isArray(files)) return null;
        if (CACHE_ENABLED) {
            await cacheSet(cacheKey, files, files.length ? ARCHIVE_FILES_TTL : ARCHIVE_FILES_EMPTY_TTL);
        }
        return files;
    });
}

function ttlForPayload(payload) {
    return (payload?.streams?.length || 0) > 0 ? DEFAULT_STREAM_TTL : NEGATIVE_CACHE_TTL;
}

function jitter(ttl) {
    if (!CACHE_ENABLED || CACHE_TTL_JITTER <= 0) return ttl;
    const delta = ttl * CACHE_TTL_JITTER;
    const min = ttl - delta / 2;
    return Math.max(1, Math.round(min + Math.random() * delta));
}

async function getCachedResponse(cacheKey) {
    if (!CACHE_ENABLED) return null;
    const entry = await cacheGet(cacheKey);
    if (!entry) return null;
    if (entry.data) {
        return entry;
    }
    return { data: entry, cachedAt: entry.cachedAt || 0 };
}

async function storeResponse(cacheKey, payload) {
    if (!CACHE_ENABLED) return;
    const ttl = jitter(ttlForPayload(payload));
    await cacheSet(cacheKey, { data: payload, cachedAt: Date.now() }, ttl);
}

function rebuildResponse(cacheKey, builder) {
    return deduped(`build:${cacheKey}`, async () => {
        const { streams, complete } = await builder();
        const response = { streams };
        if (complete) await storeResponse(cacheKey, response);
        return response;
    });
}

function maybeRevalidate(cacheKey, cachedAt, builder) {
    if (!CACHE_ENABLED || !cachedAt || STALE_AFTER_MS === 0) return;
    if (Date.now() - cachedAt < STALE_AFTER_MS) return;
    if (refreshingKeys.has(cacheKey)) return;
    refreshingKeys.add(cacheKey);
    setImmediate(async () => {
        try {
            await rebuildResponse(cacheKey, builder);
        } catch (err) {
            console.warn('[cache] background refresh failed for', cacheKey, err?.message || err);
        } finally {
            refreshingKeys.delete(cacheKey);
        }
    });
}

async function buildMovieStreams(imdbId, log = { test: false, query: false }) {
    const film = await getCinemetaMeta('movie', imdbId);
    if (!film) {
        return { streams: [], complete: false };
    }
    const title = film.name.toLowerCase().replace(/^the /i, '');
    const runtimeMinutes = parseInt(film?.runtime, 10) || 0;
    const runtimeSeconds = runtimeMinutes * 60;
    if (!runtimeSeconds) {
        console.warn("Error: can't get runtime, set to zero.");
    }
    const directorSurname = (film.director?.[0] || '').split(' ').slice(-1)[0];
    const year = parseInt(film.year, 10) || 0;
    const queryParts = [
        `(${directorSurname} OR ${year} OR ${year - 1} OR ${year + 1})`,
        `title:(${title})`,
        '-title:trailer',
        'mediatype:movies',
        'item_size:["300000000" TO "100000000000"]',
    ];
    if (log.query) console.log(queryParts.join(' AND '));
    const iaUrl = `https://archive.org/services/search/beta/page_production/?user_query=${encodeURIComponent(queryParts.join(' AND '))}&sort=week:desc&hits_per_page=${MAX_STREAMS}`;
    const results = await searchArchive(`movie:${imdbId}`, iaUrl);
    if (results === null) return { streams: [], complete: false };
    const streams = [];
    let complete = true;
    for (const res of results) {
        const identifier = res.fields.identifier;
        const files = await getArchiveFiles(identifier);
        if (files === null) {
            complete = false;
            continue;
        }
        const subtitles = files
            .filter((f) => ACCEPTED_SUBTITLES.includes(f.name.slice(-3).toLowerCase()))
            .map((f) => ({ id: f.name, url: `https://archive.org/download/${identifier}/${f.name}`, lang: 'en' }));
        const videoFiles = files.filter((f) => ACCEPTED_FILE_TYPES.includes(f.name.slice(-3).toLowerCase()) && f.length > runtimeSeconds * 0.7);
        if (videoFiles.length === 0) {
            continue;
        }
        const quality = (res.fields.title + videoFiles[0].name + (res.fields.description || ''))
            .match(/(?:dvd|blu-?ray|bd|hd|web|nd-?rip)-?(?:rip|dl)?|remux/i)?.[0] || '';
        streams.push(
            ...videoFiles.map((f) => {
                const extension = (f.name.split('.').pop() || '').toLowerCase();
                const isWebReady = extension === 'mp4';
                const sizeBytes = parseInt(f.size, 10) || 0;
                const releaseSlug = buildReleaseSlug({
                    title: res.fields.title || film.name,
                    year,
                    quality,
                    resolution: f.height || undefined,
                    codec: f.format || f.source || undefined,
                    extension,
                });
                const sourceInfo = f.source ? ` (${f.source})` : '';
                const detailLines = [
                    res.fields.title,
                    f.name !== releaseSlug ? `Source file: ${f.name}` : '',
                    `🎬 ${extension || 'file'}${sourceInfo}`,
                    `🕥 ${(f.length / 60).toFixed(0)} min   💾 ${sizeToString(sizeBytes)}`,
                ].filter(Boolean);
                return {
                    url: `https://archive.org/download/${identifier}/${f.name}`,
                    name: formatStreamName(res.fields.title || film.name, quality, f),
                    description: [releaseSlug, ...detailLines].join('\n'),
                    subtitles,
                    behaviorHints: {
                        notWebReady: !isWebReady,
                        videoSize: sizeBytes,
                        filename: releaseSlug,
                    },
                };
            })
        );
    }
    if (log.test) {
        const identifier = streams?.[0]?.url?.split('/')?.[4] || '';
        console.log(`{"id": "${imdbId}", "name": "${film.name}", "identifier": "${identifier}", "type": "movie"}`);
    }
    return { streams, complete };
}

async function buildSeriesStreams(id, log = { test: false, query: false }) {
    const [imdbId, season, ep] = id.split(':');
    const series = await getCinemetaMeta('series', imdbId);
    if (!series) {
        return { streams: [], complete: false };
    }
    const seasonNumber = parseInt(season, 10) || undefined;
    const episodeNumber = parseInt(ep, 10) || undefined;
    const sMatchName = series.name.toLowerCase().replace(/\W/g, '*');
    const episode = series.videos?.find((e) => e.season == season && e.episode == ep);
    if (!episode) {
        return { streams: [], complete: true };
    }
    const epName = (episode.name || episode.title)
        .replace(/^the /i, '')
        .replace(/\W*part\W*[0-9IVX]+\W*/i, ' ')
        .replace(/\(.*\)/g, '')
        .trim();
    const queryParts = [
        `title:("${sMatchName}" OR *${sMatchName}*)`,
        '-title:(trailer OR trailers OR promo OR promos OR review OR reviews OR interview OR interviews)',
        'mediatype:movies',
        '(series OR collection:(television OR unsorted_television OR opensource_movies))',
    ];
    if ((series.genres || []).includes('Soap')) {
        const mmyyyy = (episode.name || episode.title).match(/(january|february|march|april|may|june|july|august|september|october|november|december).*([12][90]\d{2})/i);
        queryParts[0] = mmyyyy ? `title:(${series.name.toLowerCase()} ${mmyyyy[1]} ${mmyyyy[2]})` : queryParts[0];
        queryParts.pop();
    }
    if (log.query) console.log(queryParts.join(' AND '));
    const iaUrl = `https://archive.org/services/search/beta/page_production/?user_query=${encodeURIComponent(queryParts.join(' AND '))}&hits_per_page=${MAX_STREAMS_SERIES}`;
    const results = await searchArchive(`series:${imdbId}:${season}:${ep}`, iaUrl);
    if (results === null) return { streams: [], complete: false };
    const epNameRegex = new RegExp('.*' + epName.replace(/[^a-z0-9]/gi, '.*') + '.*', 'i');
    const streams = [];
    let complete = true;
    for (const res of results) {
        const identifier = res.fields.identifier;
        const wrongSeason = new RegExp(`(?:(?:^|[^a-z])s|season)\\D?0*(?!${season}(?:\\D|$))\\d+`, 'i');
        if ((res.fields.title + identifier).match(wrongSeason)) continue;
        let regex;
        if ((res.fields.title + identifier).match(/season|[^a-z0-9]s[^a-z]?\d|^s[^a-z]?/i)) {
            regex = new RegExp(`(?:(?:^|[^a-z])ep?|episode)\\D?0*${ep}(?:\\D|$)`, 'i');
        } else {
            regex = new RegExp(`s(?:eason)?\\D?0*${season}\\D*(?:ep?|episode)\\D?0*${ep}(?:\\D|$)`, 'i');
        }
        const files = await getArchiveFiles(identifier);
        if (files === null) {
            complete = false;
            continue;
        }
        const subtitles = files
            .filter((f) => ACCEPTED_SUBTITLES.includes(f.name.slice(-3).toLowerCase()) && (f.name.match(regex) || f.name.match(epNameRegex)))
            .map((f) => ({ id: f.name, url: `https://archive.org/download/${identifier}/${f.name}`, lang: 'en' }));
        const videoFiles = files.filter((f) =>
            (f.name.match(regex) || f.name.match(epNameRegex))
            && ACCEPTED_FILE_TYPES.includes(f.name.slice(-3).toLowerCase())
            && f.name.slice(-7, -3) !== '.ia.'
        );
        if (videoFiles.length === 0) {
            continue;
        }
        const quality = (res.fields.title + videoFiles[0].name + (res.fields.description || ''))
            .match(/(?:dvd|blu-?ray|bd|hd|web|nd-?rip)-?(?:rip|dl)?|remux/i)?.[0] || '';
        streams.push(
            ...videoFiles.map((f) => {
                const extension = (f.name.split('.').pop() || '').toLowerCase();
                const isWebReady = extension === 'mp4';
                const sizeBytes = parseInt(f.size, 10) || 0;
                const releaseSlug = buildReleaseSlug({
                    title: res.fields.title || series.name,
                    year: series.year,
                    season: seasonNumber,
                    episode: episodeNumber,
                    quality,
                    resolution: f.height || undefined,
                    codec: f.format || f.source || undefined,
                    extension,
                });
                const sourceInfo = f.source ? ` (${f.source})` : '';
                const detailLines = [
                    res.fields.title,
                    f.name !== releaseSlug ? `Source file: ${f.name}` : '',
                    `🎬 ${extension || 'file'}${sourceInfo}`,
                    `🕥 ${(f.length / 60).toFixed(0)} min   💾 ${sizeToString(sizeBytes)}`,
                ].filter(Boolean);
                return {
                    url: `https://archive.org/download/${identifier}/${f.name}`,
                    name: formatStreamName(res.fields.title || series.name, quality, f),
                    description: [releaseSlug, ...detailLines].join('\n'),
                    subtitles,
                    behaviorHints: {
                        notWebReady: !isWebReady,
                        videoSize: sizeBytes,
                        filename: releaseSlug,
                    },
                };
            })
        );
    }
    if (log.test) {
        const identifier = streams?.[0]?.url?.split('/')?.[4] || '';
        console.log(`{"id": "${id}", "name": "${series.name}", "identifier": "${identifier}", "type": "series"}`);
    }
    return { streams, complete };
}

async function fetchStreams(cacheKey, builder) {
    increment('requests');
    if (!CACHE_ENABLED) {
        increment('cacheBypasses');
        return rebuildResponse(cacheKey, builder);
    }
    const cached = await getCachedResponse(cacheKey);
    if (cached) {
        increment('cacheHits');
        maybeRevalidate(cacheKey, cached.cachedAt, builder);
        return cached.data;
    }
    increment('cacheMisses');
    return rebuildResponse(cacheKey, builder);
}

function fetchMovieStreams(id, log) {
    return fetchStreams(`streams:movie:${id}`, () => buildMovieStreams(id, log));
}

function fetchSeriesStreams(id, log) {
    return fetchStreams(`streams:series:${id}`, () => buildSeriesStreams(id, log));
}

module.exports = { fetchMovieStreams, fetchSeriesStreams };
