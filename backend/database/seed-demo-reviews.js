import mysql from 'mysql2/promise';
import { databaseConfigFromEnv } from '../src/config/database.js';
import { clearDemoReviews, ensureDemoReviews } from '../src/features/varchas/book-details/demo-reviews.js';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo reviews cannot be seeded in production.');
  const workArgs = process.argv.flatMap((arg, index, args) => arg === '--work' && args[index + 1] ? [args[index + 1]] : []);
  if (workArgs.some(value => !/^works\/OL\d+W$/.test(value))) throw new Error('Use --work works/OL123W to seed a specific discovery work.');
  const connection = await mysql.createConnection(databaseConfigFromEnv());
  try {
    if (process.argv.includes('--clear')) {
      console.log(`Cleared ${await clearDemoReviews(connection)} demo reviews.`);
      return;
    }
    const [books] = await connection.query('SELECT id FROM books WHERE is_active = 1 ORDER BY id');
    const [works] = await connection.query("SELECT DISTINCT book_id FROM book_reviews WHERE is_demo = 0 AND book_id LIKE 'works/OL%W'");
    const targets = new Map([
      ...books.map(book => [`local:${book.id}`, { key: `local:${book.id}`, localId: book.id }]),
      ...works.map(row => [row.book_id, { key: row.book_id, localId: null }]),
      ...workArgs.map(key => [key, { key, localId: null }]),
    ]);
    for (const target of targets.values()) await ensureDemoReviews(connection, target);
    console.log(`Ensured 8–12 deterministic preview reviews for ${targets.size} local and discovery books.`);
    console.log('Use --work works/OL123W to initialize a discovery book without contacting a provider.');
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(`Demo review setup failed: ${error.message}`);
  process.exitCode = 1;
});
