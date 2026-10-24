import { Router } from 'express';
import { asyncHandler, HttpError } from '../errors.js';

const validId = value => /^works\/OL\d+W$/.test(value || '');
function reviewInput(body) {
  const rating = Number(body?.rating), content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || content.length < 10 || content.length > 2000) throw new HttpError(400, 'INVALID_REVIEW', 'Choose a rating from 1 to 5 and write 10 to 2,000 characters.');
  return { rating, content };
}
function validateReviewPath(bookId, reviewId) {
  if (!validId(bookId)) throw new HttpError(400, 'INVALID_BOOK_ID', 'This book link is not valid.');
  if (!/^[1-9]\d{0,19}$/.test(reviewId || '')) throw new HttpError(400, 'INVALID_REVIEW_ID', 'This review link is not valid.');
}

export function createReviewsRouter({ pool, requireAuth }) {
  const router = Router();
  router.get('/:bookId/reviews', asyncHandler(async (req, res) => {
    if (!validId(req.params.bookId)) throw new HttpError(400, 'INVALID_BOOK_ID', 'This book link is not valid.');
    const [rows] = await pool.query(`SELECT r.id, r.rating, r.content, r.created_at AS createdAt, r.updated_at AS updatedAt, u.name AS author,
      (r.user_id = ?) AS mine FROM book_reviews r JOIN users u ON u.id = r.user_id WHERE r.book_id = ? ORDER BY r.created_at DESC LIMIT 100`, [req.session?.userId || 0, req.params.bookId]);
    const [[summary]] = await pool.query('SELECT COUNT(*) AS count, AVG(rating) AS average FROM book_reviews WHERE book_id = ?', [req.params.bookId]);
    res.json({ reviews: rows, summary: { count: Number(summary.count), average: summary.average == null ? null : Number(summary.average) } });
  }));
  router.post('/:bookId/reviews', requireAuth, asyncHandler(async (req, res) => {
    if (!validId(req.params.bookId)) throw new HttpError(400, 'INVALID_BOOK_ID', 'This book link is not valid.');
    const { rating, content } = reviewInput(req.body);
    await pool.query(`INSERT INTO book_reviews (book_id, user_id, rating, content) VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE rating = VALUES(rating), content = VALUES(content), updated_at = CURRENT_TIMESTAMP`, [req.params.bookId, req.user.id, rating, content]);
    const [rows] = await pool.query(`SELECT r.id, r.rating, r.content, r.created_at AS createdAt, r.updated_at AS updatedAt, u.name AS author
      FROM book_reviews r JOIN users u ON u.id = r.user_id WHERE r.book_id = ? AND r.user_id = ?`, [req.params.bookId, req.user.id]);
    res.status(201).json({ review: rows[0] });
  }));
  router.patch('/:bookId/reviews/:reviewId', requireAuth, asyncHandler(async (req, res) => {
    validateReviewPath(req.params.bookId, req.params.reviewId);
    const { rating, content } = reviewInput(req.body);
    const [result] = await pool.query('UPDATE book_reviews SET rating = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND book_id = ? AND user_id = ?', [rating, content, req.params.reviewId, req.params.bookId, req.user.id]);
    if (!result.affectedRows) throw new HttpError(404, 'REVIEW_NOT_FOUND', 'Your review could not be found.');
    res.json({ success: true });
  }));
  router.delete('/:bookId/reviews/:reviewId', requireAuth, asyncHandler(async (req, res) => {
    validateReviewPath(req.params.bookId, req.params.reviewId);
    const [result] = await pool.query('DELETE FROM book_reviews WHERE id = ? AND book_id = ? AND user_id = ?', [req.params.reviewId, req.params.bookId, req.user.id]);
    if (!result.affectedRows) throw new HttpError(404, 'REVIEW_NOT_FOUND', 'Your review could not be found.');
    res.status(204).end();
  }));
  return router;
}
