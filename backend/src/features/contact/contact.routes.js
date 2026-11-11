import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

const limiter = rateLimit({ windowMs: 60_000, limit: 5, standardHeaders: true, legacyHeaders: false });
const field = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export function createContactRouter({ pool }) {
  const router = Router();
  router.post('/', limiter, async (req, res, next) => {
    try {
      if (!pool) return res.status(503).json({ error: { code: 'CONTACT_UNAVAILABLE', message: 'Contact messages cannot be saved right now. Please try again later.' } });
      const name = field(req.body?.name, 100);
      const email = field(req.body?.email, 254).toLowerCase();
      const subject = field(req.body?.subject, 150);
      const message = field(req.body?.message, 4000);
      if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || subject.length < 3 || message.length < 10) {
        return res.status(400).json({ error: { code: 'INVALID_CONTACT_MESSAGE', message: 'Enter a valid name, email, subject, and message.' } });
      }
      await pool.query('INSERT INTO contact_submissions (name, email, subject, message) VALUES (?, ?, ?, ?)', [name, email, subject, message]);
      return res.status(201).json({ success: true });
    } catch (error) { return next(error); }
  });
  return router;
}
