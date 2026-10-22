'use strict';

const bookModel = require('../models/book.model');
const { parseListBooksQuery } = require('../validators/book.validators');
const { notFound } = require('../utils/httpError');

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

    /** GET /api/books/:id - details of one book */
    async get(req, res) {
      const id = /^[1-9]\d{0,17}$/.test(req.params.id) ? Number(req.params.id) : null;
      const book = id === null ? null : await bookModel.findBookById(pool, id);
      if (!book) throw notFound('We could not find that book.');
      res.json({ data: book });
    },
  };
}

module.exports = { createBookController };
