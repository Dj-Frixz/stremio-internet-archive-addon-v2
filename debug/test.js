let tests = require('./tests.json');
const { fetchMovieStreams, fetchSeriesStreams } = require('../stream-handlers');

(async () => {
    const args = process.argv.slice(2);
    if (args.length > 0) {
        tests = args.map(i => tests[parseInt(i)]);
    }
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
        // console.log(obj);
        const res = obj.streams.findIndex(
            s => s.url.includes(test.identifier)
        ) >= 0; // could be s.url.split('/')[4] === test.identifier but meh
        console.log(`${res ? 'PASS' : 'FAIL'} - "${test.name}"`);
        if (!res) {
            console.log('  Expected to find:', test.identifier);
            console.log('  In streams:', obj.streams.length>0 ? 
                obj.streams.map(s => s.url.split('/')[4]).join(',\n             ') : 
                '<no streams found>');
        }
        return res;
    }));
    const notPassed = results.filter(r => !r).length;
    if (notPassed === 0) {
        process.exit(0); // pass
    } else {
        console.warn(`${notPassed}/${results.length} tests failed.`);
        process.exit(1); // fail
    }
})()