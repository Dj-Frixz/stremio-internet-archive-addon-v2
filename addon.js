const { addonBuilder }  = require('stremio-addon-sdk');
const { fetchMovieStreams, fetchSeriesStreams } = require('./stream-handlers');
const pkg = require('./package');

const builder = new addonBuilder({
    id: 'org.stremio.internet-archive',
    version: pkg.version,
    name: 'Internet Archive',
    description: pkg.description,
    catalogs: [], // { type: 'movie', id: 'ia', name: 'Internet Archive' }
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
});

builder.defineStreamHandler(function ({type, id}) {
    switch(type) {
        case 'movie':
            return fetchMovieStreams(id); // return a promise
        case 'series':
            return fetchSeriesStreams(id);
        default:
            return Promise.resolve([]); // return a promise
    }
});

module.exports = builder.getInterface();