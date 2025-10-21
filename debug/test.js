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
    const notPassed = results.filter(r => !r).length;
    if (notPassed === 0) {
        process.exit(0); // pass
    } else {
        console.warn(`${notPassed}/${results.length} tests failed.`);
        for (const i = 0; i < results.length; i++) {
            if (!results[i]) {
                console.warn(` - "${tests[i].name}" (id: ${tests[i].id}, identifier: ${tests[i].identifier}) failed.`);
            }
        }
        process.exit(1); // fail
    }
})()