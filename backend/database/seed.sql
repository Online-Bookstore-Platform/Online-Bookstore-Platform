-- =============================================================================
-- Online Bookstore - sample data for local development / demos      (story #13)
-- =============================================================================
-- Load after schema.sql:  cd backend && npm run db:setup -- --seed
--
--  * Books are public-domain classics. The ISBNs are PLACEHOLDERS: well-formed
--    (valid ISBN-13 check digits) but not real editions.
--  * Seed accounts cannot log in as shipped: password_hash holds a marker that
--    is not a valid hash, so no password is stored in the repository. To log in
--    locally, run the setup with SEED_DEMO_PASSWORD set (8+ characters); it
--    stores a bcrypt hash of that password for the three demo accounts.
--  * A few books are deliberately out of stock (0) or low (2-5) so stock rules
--    and the "availability" filter have something to show.
-- =============================================================================

SET NAMES utf8mb4;

INSERT INTO categories (id, name) VALUES
  (1, 'Classics'),
  (2, 'Science Fiction'),
  (3, 'Mystery'),
  (4, 'Adventure'),
  (5, 'Horror'),
  (6, 'Poetry'),
  (7, 'Non-Fiction');

INSERT INTO users (id, name, email, password_hash, phone, role, terms_accepted_at) VALUES
  (1, 'Store Admin', 'admin@bookstore.example', '!seed-account-no-login', NULL, 'admin', '2026-09-01 09:00:00'),
  (2, 'Asha Rao', 'asha@bookstore.example', '!seed-account-no-login', '9876543210', 'customer', '2026-09-01 09:00:00'),
  (3, 'Ravi Kumar', 'ravi@bookstore.example', '!seed-account-no-login', '9123456780', 'customer', '2026-09-01 09:00:00');

INSERT INTO books (id, isbn, title, author, category_id, price, description) VALUES
  (1, '9781001126487', 'Pride and Prejudice', 'Jane Austen', 1, 299.00, 'Elizabeth Bennet and Mr Darcy navigate pride, class and first impressions in Regency England.'),
  (2, '9781001205670', 'Emma', 'Jane Austen', 1, 279.00, 'A well-meaning young matchmaker discovers she understands everyone''s heart but her own.'),
  (3, '9781001284866', 'Jane Eyre', 'Charlotte Brontë', 1, 329.00, 'An orphaned governess finds love, mystery and independence at Thornfield Hall.'),
  (4, '9781001364056', 'Wuthering Heights', 'Emily Brontë', 1, 309.00, 'A stormy tale of obsession and revenge on the Yorkshire moors.'),
  (5, '9781001443249', 'Great Expectations', 'Charles Dickens', 1, 349.00, 'Pip''s rise from village boy to gentleman, and what it costs him.'),
  (6, '9781001522432', 'A Tale of Two Cities', 'Charles Dickens', 1, 339.00, 'London and Paris collide during the French Revolution.'),
  (7, '9781001601625', 'The Picture of Dorian Gray', 'Oscar Wilde', 1, 259.00, 'A beautiful young man stays unchanged while his portrait bears the price of his choices.'),
  (8, '9781001680811', 'Frankenstein', 'Mary Shelley', 2, 249.00, 'A scientist''s ambition creates a being he cannot control or abandon.'),
  (9, '9781001760001', 'The Time Machine', 'H. G. Wells', 2, 199.00, 'An inventor travels to the year 802,701 and finds a divided humanity.'),
  (10, '9781001839196', 'The War of the Worlds', 'H. G. Wells', 2, 219.00, 'Martian invaders descend on Victorian England.'),
  (11, '9781001918389', 'Twenty Thousand Leagues Under the Sea', 'Jules Verne', 2, 379.00, 'Captain Nemo''s submarine Nautilus takes its captives beneath the oceans.'),
  (12, '9781001997575', 'The Adventures of Sherlock Holmes', 'Arthur Conan Doyle', 3, 359.00, 'Twelve classic cases for the detective of Baker Street.'),
  (13, '9781002076767', 'The Hound of the Baskervilles', 'Arthur Conan Doyle', 3, 289.00, 'A spectral hound haunts a family on the Devon moors.'),
  (14, '9781002155950', 'The Moonstone', 'Wilkie Collins', 3, 319.00, 'A stolen diamond and one of the first detective novels in English.'),
  (15, '9781002235140', 'Treasure Island', 'Robert Louis Stevenson', 4, 229.00, 'Jim Hawkins, a treasure map and the unforgettable Long John Silver.'),
  (16, '9781002314333', 'The Jungle Book', 'Rudyard Kipling', 4, 239.00, 'Mowgli grows up among the wolves, bears and panthers of the Indian jungle.'),
  (17, '9781002393529', 'Around the World in Eighty Days', 'Jules Verne', 4, 269.00, 'Phileas Fogg stakes his fortune on circling the globe in eighty days.'),
  (18, '9781002472712', 'The Count of Monte Cristo', 'Alexandre Dumas', 4, 599.00, 'Betrayed and imprisoned, Edmond Dantès returns for patient revenge.'),
  (19, '9781002551905', 'Moby-Dick', 'Herman Melville', 4, 449.00, 'Captain Ahab''s obsessive hunt for the white whale.'),
  (20, '9781002631096', 'Dracula', 'Bram Stoker', 5, 299.00, 'Count Dracula travels from Transylvania to England, and a small band hunts him.'),
  (21, '9781002710289', 'Strange Case of Dr Jekyll and Mr Hyde', 'Robert Louis Stevenson', 5, 179.00, 'A respectable doctor''s experiment unleashes his darker self.'),
  (22, '9781002789476', 'Gitanjali', 'Rabindranath Tagore', 6, 189.00, 'Tagore''s devotional song offerings, the collection behind his Nobel Prize.'),
  (23, '9781002868669', 'Leaves of Grass', 'Walt Whitman', 6, 399.00, 'Whitman''s sprawling, celebratory poems of self and democracy.'),
  (24, '9781002947852', 'Meditations', 'Marcus Aurelius', 7, 209.00, 'The private notes of a Roman emperor on duty, change and self-command.'),
  (25, '9781003027041', 'Walden', 'Henry David Thoreau', 7, 249.00, 'Two years of simple living beside a Massachusetts pond.');

INSERT INTO inventory (book_id, quantity) VALUES
  (1, 40),
  (2, 25),
  (3, 18),
  (4, 12),
  (5, 30),
  (6, 3),
  (7, 22),
  (8, 2),
  (9, 35),
  (10, 28),
  (11, 15),
  (12, 45),
  (13, 20),
  (14, 8),
  (15, 50),
  (16, 33),
  (17, 27),
  (18, 14),
  (19, 0),
  (20, 21),
  (21, 38),
  (22, 60),
  (23, 0),
  (24, 42),
  (25, 5);

-- Asha has a cart ready for the checkout flow: Pride and Prejudice x2, Dracula x1
INSERT INTO carts (id, user_id) VALUES (1, 2);
INSERT INTO cart_items (cart_id, book_id, quantity) VALUES
  (1, 1, 2),
  (1, 20, 1);
