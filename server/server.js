'use strict';

require('dotenv').config({ quiet: true });

const { createPool } = require('./config/db');
const { createApp } = require('./app');

const port = Number(process.env.PORT || 5000);
const pool = createPool();
const app = createApp({ pool });

const server = app.listen(port, () => {
  console.log(`Online Bookstore API listening on http://localhost:${port}`);
});

function shutdown() {
  server.close(() => pool.end().finally(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
