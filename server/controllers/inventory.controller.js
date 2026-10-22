'use strict';

const inventory = require('../models/inventory.model');
const inventoryService = require('../services/inventory.service');
const { validate } = require('../validators/validate');
const {
  setStockBody,
  adjustStockBody,
  parseBookId,
  parseListStockQuery,
} = require('../validators/inventory.validators');
const { notFound } = require('../utils/httpError');

const NO_SUCH_BOOK = 'We could not find that book in the inventory.';

function createInventoryController({ pool }) {
  return {
    /** GET /api/inventory - stock levels, lowest first; ?status=low|out, ?q= */
    async list(req, res) {
      const params = parseListStockQuery(req.query);
      const { items, totalItems, totalPages } = await inventory.listStock(pool, params);
      res.json({
        data: items,
        pagination: { page: params.page, pageSize: params.pageSize, totalItems, totalPages },
      });
    },

    /** GET /api/inventory/:bookId */
    async get(req, res) {
      const stock = await inventory.getStock(pool, parseBookId(req.params.bookId));
      if (!stock) throw notFound(NO_SUCH_BOOK);
      res.json({ data: stock });
    },

    /** PUT /api/inventory/:bookId  { quantity, reason? } - set the exact stock (stock-take) */
    async set(req, res) {
      const bookId = parseBookId(req.params.bookId);
      const body = validate(setStockBody, req.body, 'The stock quantity is not valid.');
      await inventoryService.setStock(pool, { bookId, quantity: body.quantity, adminId: req.user.id, reason: body.reason });
      res.json({ data: await inventory.getStock(pool, bookId) });
    },

    /** PATCH /api/inventory/:bookId  { change, reason? } - add or remove copies */
    async adjust(req, res) {
      const bookId = parseBookId(req.params.bookId);
      const body = validate(adjustStockBody, req.body, 'The stock change is not valid.');
      await inventoryService.adjustStock(pool, { bookId, change: body.change, adminId: req.user.id, reason: body.reason });
      res.json({ data: await inventory.getStock(pool, bookId) });
    },
  };
}

module.exports = { createInventoryController };
