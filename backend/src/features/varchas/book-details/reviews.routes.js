import { Router } from 'express';
import { asyncHandler, HttpError } from '../errors.js';
import { ensureDemoReviews } from './demo-reviews.js';

const bookIdentity = value => {
  if (/^works\/OL\d+W$/.test(value || '')) return { key: value, localId: null };
  if (/^[1-9]\d{0,17}$/.test(value || '')) return { key: `local:${value}`, localId: value };
  return null;
};
function reviewInput(body) {
  const rating = Number(body?.rating), content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || content.length < 10 || content.length > 2000) throw new HttpError(400, 'INVALID_REVIEW', 'Choose a rating from 1 to 5 and write 10 to 2,000 characters.');
  return { rating, content };
}
function validateReviewPath(bookId, reviewId) {
  if (!bookIdentity(bookId)) throw new HttpError(400, 'INVALID_BOOK_ID', 'This book link is not valid.');
  if (!/^[1-9]\d{0,19}$/.test(reviewId || '')) throw new HttpError(400, 'INVALID_REVIEW_ID', 'This review link is not valid.');
}

export function createReviewsRouter({ pool, requireAuth, env = process.env, ensureDemos = ensureDemoReviews }) {
  const router = Router();
  router.get('/:bookId/reviews', asyncHandler(async (req, res) => {
    const identity = bookIdentity(req.params.bookId);
    if (!identity) throw new HttpError(400, 'INVALID_BOOK_ID', 'This book link is not valid.');
    if (identity.localId) {
      const [books] = await pool.query('SELECT id FROM books WHERE id = ? AND is_active = 1 LIMIT 1', [identity.localId]);
      if (!books.length) throw new HttpError(404, 'BOOK_NOT_FOUND', 'This book is unavailable.');
    }
    if (env.NODE_ENV !== 'production') await ensureDemos(pool, identity);
    const demoFilter = env.NODE_ENV === 'production' ? 'AND r.is_demo = 0' : '';
    const [rows] = await pool.query(`SELECT r.id, r.rating, r.content, r.created_at AS createdAt, r.updated_at AS updatedAt,
      u.name AS author, r.demo_label AS demoLabel, r.is_demo AS isDemo, (r.user_id = ?) AS mine
      FROM book_reviews r LEFT JOIN users u ON u.id = r.user_id
      WHERE r.book_id = ? ${demoFilter} ORDER BY r.created_at DESC LIMIT 100`, [req.session?.userId || 0, identity.key]);
    const [[summary]] = await pool.query(`SELECT COUNT(*) AS count, AVG(rating) AS average
      FROM book_reviews r WHERE r.book_id = ? AND r.is_demo = 0`, [identity.key]);
    const [[sampleSummary]] = env.NODE_ENV === 'production'
      ? [[{ count: 0, average: null }]]
      : await pool.query('SELECT COUNT(*) AS count, AVG(rating) AS average FROM book_reviews WHERE book_id = ? AND is_demo = 1', [identity.key]);
    res.json({ reviews: rows.map(row => ({ ...row, isDemo: Boolean(row.isDemo), mine: Boolean(row.mine), author: row.isDemo ? row.demoLabel : row.author })), summary: {
      count: Number(summary.count), average: summary.average == null ? null : Number(summary.average),
      demoCount: Number(sampleSummary.count || 0), demoAverage: sampleSummary.average == null ? null : Number(sampleSummary.average),
    } });
  }));
  router.post('/:bookId/reviews', requireAuth, asyncHandler(async (req, res) => {
    const identity = bookIdentity(req.params.bookId);
    if (!identity) throw new HttpError(400, 'INVALID_BOOK_ID', 'This book link is not valid.');
    const { rating, content } = reviewInput(req.body);
    if (identity.localId) {
      const [books] = await pool.query('SELECT id FROM books WHERE id = ? AND is_active = 1 LIMIT 1', [identity.localId]);
      if (!books.length) throw new HttpError(404, 'BOOK_NOT_FOUND', 'This book is unavailable.');
    }
    await pool.query(`INSERT INTO book_reviews (book_id, local_book_id, user_id, is_demo, rating, content) VALUES (?, ?, ?, 0, ?, ?)
      ON DUPLICATE KEY UPDATE rating = VALUES(rating), content = VALUES(content), updated_at = CURRENT_TIMESTAMP`, [identity.key, identity.localId, req.user.id, rating, content]);
    const [rows] = await pool.query(`SELECT r.id, r.rating, r.content, r.created_at AS createdAt, r.updated_at AS updatedAt, u.name AS author
      FROM book_reviews r JOIN users u ON u.id = r.user_id WHERE r.book_id = ? AND r.user_id = ?`, [identity.key, req.user.id]);
    res.status(201).json({ review: rows[0] });
  }));
  router.patch('/:bookId/reviews/:reviewId', requireAuth, asyncHandler(async (req, res) => {
    validateReviewPath(req.params.bookId, req.params.reviewId);
    const { rating, content } = reviewInput(req.body);
    const { key } = bookIdentity(req.params.bookId);
    const [result] = await pool.query('UPDATE book_reviews SET rating = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND book_id = ? AND user_id = ?', [rating, content, req.params.reviewId, key, req.user.id]);
    if (!result.affectedRows) throw new HttpError(404, 'REVIEW_NOT_FOUND', 'Your review could not be found.');
    res.json({ success: true });
  }));
  router.delete('/:bookId/reviews/:reviewId', requireAuth, asyncHandler(async (req, res) => {
    validateReviewPath(req.params.bookId, req.params.reviewId);
    const { key } = bookIdentity(req.params.bookId);
    const [result] = await pool.query('DELETE FROM book_reviews WHERE id = ? AND book_id = ? AND user_id = ?', [req.params.reviewId, key, req.user.id]);
    if (!result.affectedRows) throw new HttpError(404, 'REVIEW_NOT_FOUND', 'Your review could not be found.');
    res.status(204).end();
  }));
  return router;
}
