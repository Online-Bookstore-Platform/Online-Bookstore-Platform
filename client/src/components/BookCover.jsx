import { coverColour, coverLayout } from '../utils/cover.js';

/**
 * A typographic book cover. Purely decorative (the title and author are always
 * written out in text next to it), so it is hidden from screen readers.
 *
 * `.cover` is the size container; everything sized in cqw lives inside
 * `.cover__content`, because cqw on the container itself would refer to an
 * outer container (or the viewport) instead of the cover.
 */
export default function BookCover({ book }) {
  const initial = book.title.replace(/^(the|a|an)\s+/i, '').charAt(0);
  return (
    <div
      className={`cover cover--${coverLayout(book.id)}`}
      style={{ '--cover': coverColour(book.category.name) }}
      aria-hidden="true"
    >
      <div className="cover__content">
        <span className="cover__initial">{initial}</span>
        <span className="cover__title">{book.title}</span>
        <span className="cover__author">{book.author}</span>
      </div>
    </div>
  );
}
