const { addonBuilder }  = require('stremio-addon-sdk');
const { fetchMovieStreams, fetchSeriesStreams } = require('./stream-handlers');
const pkg = require('./package');

const manifestName = process.env.MANIFEST_NAME || 'Internet Archive';
const manifestDescription = process.env.MANIFEST_DESCRIPTION || pkg.description;
const manifestLogo = process.env.MANIFEST_LOGO || process.env.LANDING_LOGO || '';

const builder = new addonBuilder({
    id: 'org.stremio.internet-archive',
    version: pkg.version,
    name: manifestName,
    description: manifestDescription,
    logo: manifestLogo || undefined,
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