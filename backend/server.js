'use strict';
// If this file is executed directly (e.g. `node server.js`), force the web server to start.
if (require.main === module) {
    process.env.FORCE_SERVER_LISTEN = '1';
}
module.exports = require('./src/infrastructure/web/server');
