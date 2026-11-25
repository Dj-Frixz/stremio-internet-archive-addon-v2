const http = require("http");
const { getRouter } = require("stremio-addon-sdk");

const addonInterface = require("./addon");
const { CACHE_BACKEND } = require("./cache");
const { renderLandingPage } = require("./landing-page");

const router = getRouter(addonInterface);
const port = process.env.PORT || 7000;
const landingBuffer = Buffer.from(renderLandingPage());

const server = http.createServer((req, res) => {
	const url = new URL(req.url || '/', "http://localhost");
	if (req.method === "GET" && url.pathname === "/") {
		res.writeHead(200, {
			"Content-Type": "text/html; charset=utf-8",
			"Content-Length": landingBuffer.length,
		});
		res.end(landingBuffer);
		return;
	}
	router(req, res, () => {
		res.statusCode = 404;
		res.end();
	});
});

server.listen(port, () => {
	console.log(`Stremio Internet Archive add-on listening on port ${port}`);
	console.log(`[cache] ${CACHE_BACKEND}`);
});

// If you want this addon to appear in the addon catalogs, call .publishToCentral() with the publically available URL to your manifest
// addonInterface.publishToCentral?.('https://my-addon.com/manifest.json');
