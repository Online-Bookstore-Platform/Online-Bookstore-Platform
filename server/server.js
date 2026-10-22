'use strict';

require('dotenv').config({ quiet: true });

const { createPool } = require('./config/db');
const { createApp } = require('./app');

const port = Number(process.env.PORT || 5000);
const pool = createPool();
const allowDevAuth = process.env.ALLOW_DEV_AUTH === 'true';
if (allowDevAuth) {
  console.warn('WARNING: ALLOW_DEV_AUTH=true - anyone can act as any user with an X-Dev-User-Id header. Development only.');
}
const app = createApp({ pool, allowDevAuth });

const server = app.listen(port, () => {
  console.log(`Online Bookstore API listening on http://localhost:${port}`);
});

function shutdown() {
  server.close(() => pool.end().finally(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
