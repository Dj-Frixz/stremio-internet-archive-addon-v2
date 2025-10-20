const tests = require('./tests.json');
const { fetchMovieStreams, fetchSeriesStreams } = require('../stream-handlers');

(async () => {
    const results = await Promise.all(tests.map(async (test) => {
        let obj;
        switch (test.type) {
            case 'movie':
                obj = await fetchMovieStreams(test.id);break;
            case 'series':
                obj = await fetchSeriesStreams(test.id);break;
            default:
                throw new Error(`Unknown type: ${test.type}`);
        }
        const res = obj.streams.findIndex(
            s => s.url.endsWith(test.identifier)
        ) >= 0;
        console.log(`${res ? 'PASS' : 'FAIL'} - ${test.type} "${test.name}" (id: ${test.id}, identifier: ${test.identifier})`);
        return res;
    }));
    console.log(`${results.filter(r => r).length}/${results.length} tests passed.`);
})