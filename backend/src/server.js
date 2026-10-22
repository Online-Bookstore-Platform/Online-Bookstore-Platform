import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createApp } from './app.js';

async function loadAdapters() {
  const modulePath = process.env.VARCHAS_ADAPTER_MODULE;
  if (!modulePath) return {};
  const moduleUrl = pathToFileURL(resolve(modulePath)).href;
  const adapterModule = await import(moduleUrl);
  return typeof adapterModule.createVarchasAdapters === 'function'
    ? adapterModule.createVarchasAdapters()
    : adapterModule.default;
}

const adapters = await loadAdapters();
if (process.env.NODE_ENV === 'production' && !adapters?.repositories) {
  throw new Error('Production requires a VARCHAS_ADAPTER_MODULE that provides repositories and a persistent sessionStore.');
}
const app = createApp({ repositories: adapters?.repositories, sessionStore: adapters?.sessionStore, sessionSecret: process.env.SESSION_SECRET });

const port = Number(process.env.PORT) || 5000;

app.listen(port, () => {
  console.log(`Online Bookstore API listening on port ${port}`);
});
