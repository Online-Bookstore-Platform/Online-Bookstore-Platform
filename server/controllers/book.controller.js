'use strict';

const bookModel = require('../models/book.model');
const { parseListBooksQuery } = require('../validators/book.validators');

function createBookController({ pool }) {
  return {
    /** GET /api/books - browse, search, filter, sort, paginate */
    async list(req, res) {
      const params = parseListBooksQuery(req.query);
      const { items, totalItems, totalPages } = await bookModel.searchBooks(pool, params);
      res.json({
        data: items,
        pagination: { page: params.page, pageSize: params.pageSize, totalItems, totalPages },
      });
    },

    /** GET /api/books/filters - options for the filter controls */
    async filters(_req, res) {
      res.json({ data: await bookModel.getFilterOptions(pool) });
    },
  };
}

module.exports = { createBookController };
