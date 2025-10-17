const { serveHTTP } = require("stremio-addon-sdk");

const addonInterface = require("./addon");
serveHTTP(addonInterface, { port: process.env.PORT || 7000 });

// If you want this addon to appear in the addon catalogs, call .publishToCentral() with the publically available URL to your manifest
//publishToCentral('https://my-addon.com/manifest.json')