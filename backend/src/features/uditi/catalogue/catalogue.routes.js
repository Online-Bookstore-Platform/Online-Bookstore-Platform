import { Router } from 'express';
import { asyncHandler } from '../shared/errors.js';
import { parseCatalogueQuery } from './catalogue.validation.js';
import { getFilterOptions, searchBooks } from './catalogue.repository.js';

/**
 * Public, read-only catalogue API. Mounted by the integration owner at /api/catalogue.
 * (Single-book details are Varchas's GET /api/books/:bookId.)
 *
 *   GET /books    ?q &category &author &minPrice &maxPrice &availability &sort &order &page &pageSize
 *   GET /filters  options for the filter controls
 */
export function createCatalogueRouter({ pool }) {
  const router = Router();

  router.get('/filters', asyncHandler(async (_request, response) => {
    response.json({ filters: await getFilterOptions(pool) });
  }));

  router.get('/books', asyncHandler(async (request, response) => {
    const params = parseCatalogueQuery(request.query);
    const { books, totalItems, totalPages } = await searchBooks(pool, params);
    response.json({ books, pagination: { page: params.page, pageSize: params.pageSize, totalItems, totalPages } });
  }));

  return router;
}
