const { getRouter } = require("stremio-addon-sdk");
const addonInterface = require("./addon");
const { renderLandingPage } = require("./landing-page");

const router = getRouter(addonInterface);
const landingBuffer = Buffer.from(renderLandingPage());

module.exports = function(req, res) {
    const url = new URL(req.url || '/', "http://localhost");
    if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Length": landingBuffer.length,
        });
        res.end(landingBuffer);
        return;
    }
    router(req, res, function() {
        res.statusCode = 404;
        res.end();
    });
}