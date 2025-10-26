const ACCEPTED_FILE_TYPES = ['avi', 'mp4', 'mkv', 'wmv', 'mov', 'm4v'];
const ACCEPTED_SUBTITLES = ['srt', 'vtt', 'ass'];
const MAX_STREAMS = 5;
const MAX_STREAMS_SERIES = 15;
// this function converts number of bytes to a string ending in MB or GB
const sizeToString = bytes => bytes >= 1073741824 ? `${(bytes/1073741824).toFixed(1)}GB` : `${(bytes/1048576).toFixed(0)}MB`;

async function fetchMovieStreams(id, log = {test:false, query:false}) {
    const imdbId = id;
    const cinemetaUrl = `https://v3-cinemeta.strem.io/meta/movie/${imdbId}.json`;
    const cinemetaResponse = await fetch(cinemetaUrl);
    if (!cinemetaResponse.ok) {
        return { streams: [] };
    }
    const film = (await cinemetaResponse.json())?.meta;
    if (!film) {
        return { streams: [] };
    }
    const title = film.name.toLowerCase() // lowercase to avoid known ia bug with "TO" in title
                           .replace(/^the /i,''); // i.e. include 'evil dead' for 'the evil dead'
    const runtime = parseInt(film?.runtime?.slice(0,-4) || 0) * 60; // typical runtime (in seconds)
    if (runtime === 0) {
        console.warn("Error: can't get runtime, set to zero.")
    }
    const director_surname = (film.director?.[0] || '').split(' ').slice(-1)[0];
    const year = film.year * 1; // cast to int
    const queryParts = [
        `(${director_surname} OR ${year} OR ${year-1} OR ${year+1})`, // director's surname or year (±1)
        `title:(${title})`,
        '-title:trailer', // exclude trailers
        'mediatype:movies', // movies only
        'item_size:["300000000" TO "100000000000"]' // size between ~300MB and ~100GB
    ];
    if (log.query) console.log(queryParts.join(' AND '));
    const iaUrl = `https://archive.org/services/search/beta/page_production/?user_query=${encodeURIComponent(queryParts.join(' AND '))}&sort=week:desc&hits_per_page=${MAX_STREAMS}`;
    // // console.log(iaUrl);
    const iaResponse = await fetch(iaUrl);
    if (!iaResponse.ok) {
        return { streams: [] };
    }
    const iaData = await iaResponse.json();
    const results = iaData?.response?.body?.hits?.hits || [];
    // console.log(`Found ${results.length} results on IA for ${film.name} (${imdbId})`);
    let streams = [];
    let counter = 0;
    for (const res of results) {
        const id = res.fields.identifier;
        const metaResponse = await fetch(`https://archive.org/metadata/${id}/files`);
        const files = (await metaResponse.json())?.result || [];

        const subtitles = files
            .filter(f => ACCEPTED_SUBTITLES.includes(f.name.slice(-3).toLowerCase()))
            .map(f => ({id: f.name, url: `https://archive.org/download/${id}/${f.name}`, lang:'en'})); // lang en by default

        // skip videos too short, likely not the full movie (require at least 70% of typical runtime)
        const videoFiles = files.filter(f => ACCEPTED_FILE_TYPES.includes(f.name.slice(-3).toLowerCase()) && f.length > runtime*0.7);
        
        if (videoFiles.length === 0) {
            // console.log(` - ${id} has no acceptable video files, skipping`);
            continue;
        }

        const quality = (res.fields.title+videoFiles[0].name+(res.fields.description||'')).match(/(?:dvd|blu-?ray|bd|hd|web|nd-?rip)-?(?:rip|dl)?|remux/i)?.[0] || '';
        streams = streams.concat( // video files
            videoFiles.map(f => ({
                url: `https://archive.org/download/${id}/${f.name}`,
                name: `Archive.org ${quality} ${f.height}p ${f.format}`,
                description: `${res.fields.title}\n${f.name}\n🎬 ${f.name.slice(-3).toLowerCase()} (${f.source})\n🕥 ${(f.length/60).toFixed(0)} min   💾 ${sizeToString(f.size)}`,
                subtitles: subtitles,
                behaviorHints: {
                    notWebReady: f.name.slice(-3).toLowerCase() !== 'mp4', // mp4 is the only web-ready format
                    videoSize: parseInt(f.size) || 0,
                    filename: f.name
                }
            }))
        );

        // ADD IN THE FUTURE AN OPTION TO ENABLE TORRENTS
        // const maxSize = Math.max(...videoFiles.map(f => f.size || 0));
        // const maxSizeFile = videoFiles.find(f => f.size == maxSize);
        // const maxSizeFileRes = maxSizeFile.height || Math.max(...videoFiles.map(f => f.height || 0));
        // const maxSizeFileType = maxSizeFile.name.slice(-3).toLowerCase();
        // streams = streams.concat( // torrents
        //     files
        //     .filter(f => f.name.slice(-7)==='torrent')
        //     .map(f => ({
        //         infoHash: f.btih, // BitTorrent info hash (probably)
        //         name: `Archive.org ${quality} ${maxSizeFileRes!==0 ? maxSizeFileRes+'p' : ''} ${f.format}`,
        //         description: `${res.fields.title}\n${f.name}\n🎬 ${maxSizeFileType} (archive torrent)\n🕥 ${(maxSizeFile.length/60).toFixed(0)} min   💾 ${sizeToString(maxSize)}`,
        //         subtitles: subtitles,
        //         behaviorHints: { // use the largest file as reference
        //             videoSize: maxSize,
        //             filename: files.find(f => f.size == maxSize)?.name
        //         }
        //     }))
        // );
        // console.log(` - ${id} (${streams.length - counter} streams)`);
        counter = streams.length;
    }
    // console.log(` -> Returning ${streams.length} streams`);
    // // console.log(streams); // used for debugging
    if (log.test) {
        const identifier = streams?.[0]?.url?.split('/')?.[4] || '';
        console.log(`{"id": "${imdbId}", "name": "${film.name}", "identifier": "${identifier}", "type": "movie"}`);
    }
    return { streams: streams }
}

async function fetchSeriesStreams(id, log = {test:false, query:false}) {
    const [imdbId, season, ep] = id.split(':');
    const cinemetaUrl = `https://v3-cinemeta.strem.io/meta/series/${imdbId}.json`;
    const cinemetaResponse = await fetch(cinemetaUrl);
    if (!cinemetaResponse.ok) {
        return { streams: [] };
    }
    const series = (await cinemetaResponse.json())?.meta;
    const sMatchName = series.name.toLowerCase().replace(/\W/g,'*');
    const episode = series.videos.find(e => e.season == season && e.episode == ep);
    const epName = (episode.name || episode.title).replace(/^the /i,'') // remove 'the' at start
        .replace(/\W*part\W*[0-9IVX]+\W*/i,' ') // remove 'part x' from episode name
        .replace(/\(.*\)/g,'') // remove anything in parentheses
        // .replace(/[^a-z0-9]/g,'') // remove non-alphanumeric characters
        .trim(); // remove leading/trailing spaces
    // console.log(epName);

    const queryParts = [
        `title:("${sMatchName}" OR *${sMatchName}*)`, // lowercase to avoid known ia bug with "TO" in title
        '-title:(trailer OR trailers OR promo OR promos OR review OR reviews OR interview OR interviews)', // exclude
        'mediatype:movies', // videos only ('movies' on archive.org includes TV shows)
        '(series OR collection:(television OR unsorted_television OR opensource_movies))' // filter to TV shows only
    ];
    if (series.genres.includes('Soap')) {
        const mmyyyy = (episode.name || episode.title).match(
            /(january|february|march|april|may|june|july|august|september|october|november|december).*([12][90]\d{2})/i
        );
        queryParts[0] = mmyyyy ? `title:(${series.name.toLowerCase()} ${mmyyyy[1]} ${mmyyyy[2]})` : queryParts[0];
        queryParts.pop(); // remove series/collection filter for soaps
    }
    if (log.query) console.log(queryParts.join(' AND '));
    const iaUrl = `https://archive.org/services/search/beta/page_production/?user_query=${encodeURIComponent(queryParts.join(' AND '))}&hits_per_page=${MAX_STREAMS_SERIES}`;
    // console.log(iaUrl);
    const iaResponse = await fetch(iaUrl);
    if (!iaResponse.ok) {
        console.error('Internet Archive error:', iaResponse.status, iaResponse.statusText);
        return { streams: [] };
    }
    const iaData = await iaResponse.json();
    const results = iaData?.response?.body?.hits?.hits || [];
    // console.log(`Found ${results.length} results on IA for ${series.name}, ${season}x${ep} (${imdbId})`);
    let streams = [];
    let counter = 0;
    const epNameRegex = new RegExp('.*'+ // find ref to episode name in file names
        epName.replace(/[^a-z0-9]/ig,'.*') + '.*','i');

    // console.log(epNameRegex);
    for (const res of results) {
        const id = res.fields.identifier;
        let regex;
        const wrongSeason = new RegExp(`(?:(?:^|[^a-z])s|season)\\D?0*(?!${season}(?:\\D|$))\\d+`,'i');

        if ((res.fields.title+id).match(wrongSeason)) continue; // wrong season, skip
        else if ((res.fields.title+id).match(/season|[^a-z0-9]s[^a-z]?\d|^s[^a-z]?/i)) { // if archive includes one season only
            regex = new RegExp(`(?:(?:^|[^a-z])ep?|episode)\\D?0*${ep}(?:\\D|$)`,'i'); // e.g. E05 or ep-5 or episode 5
        } else {
            regex = new RegExp(`s(?:eason)?\\D?0*${season}\\D*(?:ep?|episode)\\D?0*${ep}(?:\\D|$)`,'i'); // e.g. S01E05 or s1-e5
        }
        
        const metaResponse = await fetch(`https://archive.org/metadata/${id}/files`);
        const files = (await metaResponse.json())?.result || [];

        const subtitles = files
            .filter(f => ACCEPTED_SUBTITLES.includes(f.name.slice(-3).toLowerCase())
                         && (f.name.match(regex) || f.name.match(epNameRegex)))
            .map(f => ({id: f.name, url: `https://archive.org/download/${id}/${f.name}`, lang:'en'})); // lang en by default

        const videoFiles = files.filter(f => 
            (f.name.match(regex) || f.name.match(epNameRegex))
             && ACCEPTED_FILE_TYPES.includes(f.name.slice(-3).toLowerCase())
             && f.name.slice(-7,-3)!=='.ia.'
        );
        
        if (videoFiles.length === 0) {
            // console.log(` - ${id} doesn't have S0${season}xE${ep}, skipping`);
            continue;
        }

        const quality = (res.fields.title+videoFiles[0].name+(res.fields.description||'')).match(/(?:dvd|blu-?ray|bd|hd|web|nd-?rip)-?(?:rip|dl)?|remux/i)?.[0] || '';
        streams = streams.concat( // video files
            videoFiles.map(f => ({
                url: `https://archive.org/download/${id}/${f.name}`,
                name: `Archive.org ${quality} ${f.height}p ${f.format}`,
                description: `${res.fields.title}\n${f.name}\n🎬 ${f.name.slice(-3).toLowerCase()} (${f.source})\n🕥 ${(f.length/60).toFixed(0)} min   💾 ${sizeToString(f.size)}`,
                subtitles: subtitles,
                behaviorHints: {
                    notWebReady: f.name.slice(-3).toLowerCase() !== 'mp4', // mp4 is the only web-ready format
                    videoSize: parseInt(f.size) || 0,
                    filename: f.name
                }
            }))
        );

        // ADD IN THE FUTURE AN OPTION TO ENABLE TORRENTS
        // const maxSize = Math.max(...videoFiles.map(f => f.size || 0));
        // const maxSizeFile = videoFiles.find(f => f.size == maxSize);
        // const maxSizeFileRes = maxSizeFile.height || Math.max(...videoFiles.map(f => f.height || 0));
        // const maxSizeFileType = maxSizeFile.name.slice(-3).toLowerCase();
        // streams = streams.concat( // torrents
        //     files
        //     .filter(f => f.name.slice(-7)==='torrent')
        //     .map(f => ({
        //         infoHash: f.btih, // BitTorrent info hash (probably)
        //         name: `Archive.org ${quality} ${maxSizeFileRes!==0 ? maxSizeFileRes+'p' : ''} ${f.format}`,
        //         description: `${res.fields.title}\n${f.name}\n🎬 ${maxSizeFileType} (archive torrent)\n🕥 ${(maxSizeFile.length/60).toFixed(0)} min   💾 ${sizeToString(maxSize)}`,
        //         subtitles: subtitles,
        //         behaviorHints: { // use the largest file as reference
        //             videoSize: maxSize,
        //             filename: files.find(f => f.size == maxSize)?.name
        //         }
        //     }))
        // );
        // console.log(` - ${id} (${streams.length - counter} streams)`);
        counter = streams.length;
    }
    // console.log(` -> Returning ${streams.length} streams`);
    // // console.log(streams); // used for debugging
    if (log.test) {
        const identifier = streams?.[0]?.url?.split('/')?.[4] || '';
        console.log(`{"id": "${id}", "name": "${series.name}", "identifier": "${identifier}", "type": "series"}`);
    }
    return { streams: streams }
}

module.exports = { fetchMovieStreams, fetchSeriesStreams };