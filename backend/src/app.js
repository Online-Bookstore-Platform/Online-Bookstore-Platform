import express from 'express';

const app = express();

app.disable('x-powered-by');
app.use(express.json());

// Scaffold endpoint only. Feature routes will be registered here after their stories are implemented.
app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'online-bookstore-api' });
});

export default app;
