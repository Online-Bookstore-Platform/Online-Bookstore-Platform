import { Router } from 'express';
import { HttpError, asyncHandler } from '../errors.js';
import { validateBookId, validateBookInput } from './book.validation.js';

export function createBooksRouter({ books }) {
  const router = Router();
  router.get('/:bookId', asyncHandler(async (request, response) => {
    const book = await books.findById(validateBookId(request.params.bookId));
    if (!book) throw new HttpError(404, 'BOOK_NOT_FOUND', 'This book is unavailable.');
    response.json({ book });
  }));

  return router;
}

export function createAdminBooksRouter({ books, requireAdmin }) {
  const router = Router();
  router.use(...requireAdmin);
  router.get('/books', asyncHandler(async (_request, response) => response.json({ books: await books.list() })));
  router.post('/books', asyncHandler(async (request, response) => {
    const book = await books.create(validateBookInput(request.body));
    response.status(201).json({ book });
  }));
  router.patch('/books/:bookId', asyncHandler(async (request, response) => {
    const book = await books.update(validateBookId(request.params.bookId), validateBookInput(request.body, { partial: true }));
    if (!book) throw new HttpError(404, 'BOOK_NOT_FOUND', 'This book is unavailable.');
    response.json({ book });
  }));
  router.delete('/books/:bookId', asyncHandler(async (request, response) => {
    const removed = await books.deleteOrDeactivate(validateBookId(request.params.bookId));
    if (!removed) throw new HttpError(404, 'BOOK_NOT_FOUND', 'This book is unavailable.');
    response.status(204).end();
  }));
  return router;
}
