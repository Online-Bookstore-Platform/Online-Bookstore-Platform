import { HttpError, notFound } from '../shared/errors.js';
import * as repository from './cart.repository.js';

function unavailableBook(book) {
  return new HttpError(
    409,
    'BOOK_UNAVAILABLE',
    !book || !book.isActive
      ? 'This book is no longer available.'
      : 'This book is out of stock.',
    [{ bookId: book?.bookId, title: book?.title ?? null, available: book?.quantity ?? 0 }]
  );
}

export function createCartService({ pool, withTransaction }) {
  return {
    get(userId) {
      return repository.getCart(pool, userId);
    },

    async add(userId, { bookId, quantity }) {
      return withTransaction(pool, async connection => {
        const cartId = await repository.getCartId(connection, userId, { create: true, lock: true });
        const book = await repository.findBookAvailability(connection, bookId);
        if (!book || !book.isActive || book.quantity < 1) throw unavailableBook(book);
        const current = await repository.getItemQuantity(connection, cartId, bookId, { lock: true });
        if (current + quantity > book.quantity) {
          throw new HttpError(409, 'INSUFFICIENT_STOCK', `Only ${book.quantity} ${book.quantity === 1 ? 'copy is' : 'copies are'} available.`, [
            { bookId, title: book.title, requested: current + quantity, available: book.quantity },
          ]);
        }
        await repository.addItem(connection, cartId, bookId, quantity);
        return repository.getCart(connection, userId);
      });
    },

    async update(userId, bookId, quantity) {
      return withTransaction(pool, async connection => {
        const cartId = await repository.getCartId(connection, userId, { lock: true });
        if (!cartId) throw notFound('That book is not in your cart.', 'CART_ITEM_NOT_FOUND');
        const current = await repository.getItemQuantity(connection, cartId, bookId, { lock: true });
        if (!current) throw notFound('That book is not in your cart.', 'CART_ITEM_NOT_FOUND');
        const book = await repository.findBookAvailability(connection, bookId);
        if (!book || !book.isActive || book.quantity < quantity) throw unavailableBook(book);
        await repository.setItemQuantity(connection, cartId, bookId, quantity);
        return repository.getCart(connection, userId);
      });
    },

    async remove(userId, bookId) {
      const cartId = await repository.getCartId(pool, userId);
      if (!cartId || !(await repository.removeItem(pool, cartId, bookId))) {
        throw notFound('That book is not in your cart.', 'CART_ITEM_NOT_FOUND');
      }
      return repository.getCart(pool, userId);
    },
  };
}

