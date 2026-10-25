// Fictional preview material only. These are not customer or purchaser identities.
// Fixed content and dates keep every book's preview stable across reads and reseeds.
const reviews = [
  { name: 'Mira Sen', rating: 5, content: 'The kind of book that makes an ordinary evening disappear. I kept thinking about the last chapter the next morning.', days: 41 },
  { name: 'Arjun Rao', rating: 4, content: 'A warm, thoughtful read with a few passages I went back to twice. The middle is quieter, but the ending earns it.', days: 26 },
  { name: 'Leela Nair', rating: 3, content: 'There are some lovely ideas here. I wanted a little more momentum in the second half.', days: 18 },
  { name: 'Kabir Mehta', rating: 5, content: 'Beautifully observed, especially in the small conversations. An easy recommendation for a slow weekend.', days: 63 },
  { name: 'Tara Iyer', rating: 2, content: 'The premise caught my attention, though the characters never quite came alive for me.', days: 9 },
  { name: 'Dev Malhotra', rating: 4, content: 'Clear, generous writing and a setting that feels lived in. I would happily read more from this author.', days: 34 },
  { name: 'Nisha Kapoor', rating: 5, content: 'I borrowed this for a short trip and finished it before I got home. Moving without being sentimental.', days: 75 },
  { name: 'Rohan Das', rating: 3, content: 'An interesting book with a strong opening. Some sections worked better for me than others.', days: 14 },
  { name: 'Ananya Bose', rating: 4, content: 'A rewarding read once I settled into its rhythm. The details and descriptions are especially good.', days: 52 },
  { name: 'Ishaan Kulkarni', rating: 1, content: 'This one was not a match for me; I found the pacing difficult to follow.', days: 5 },
  { name: 'Pooja Menon', rating: 5, content: 'Quietly absorbing, with a voice that feels distinctive from the first few pages.', days: 29 },
  { name: 'Sameer Ali', rating: 4, content: 'A solid, memorable read. A couple of loose ends kept it just short of a favourite.', days: 87 },
];

function stableOffset(value) {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) % reviews.length;
}

export async function ensureDemoReviews(pool, identity) {
  const offset = stableOffset(identity.key);
  const count = 8 + (offset % 5); // 8–12 varied previews per book.
  // Remove only rows created by the earlier sample seed format for this exact book.
  await pool.query('DELETE FROM book_reviews WHERE book_id = ? AND is_demo = 1 AND demo_key LIKE ?', [identity.key, `${identity.key}:folio-demo:%`]);
  for (let index = 0; index < count; index += 1) {
    const item = reviews[(index + offset) % reviews.length];
    const date = new Date(Date.UTC(2025, 0, 1) + (index * 13 + offset) * 86400000 - item.days * 86400000);
    const createdAt = date.toISOString().slice(0, 19).replace('T', ' ');
    await pool.query(`INSERT INTO book_reviews
      (book_id, local_book_id, user_id, is_demo, demo_key, demo_label, rating, content, created_at)
      VALUES (?, ?, NULL, 1, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE demo_label = VALUES(demo_label), rating = VALUES(rating), content = VALUES(content), created_at = VALUES(created_at)`,
    [identity.key, identity.localId, `${identity.key}:folio-preview:${index + 1}`, item.name, item.rating, item.content, createdAt]);
  }
}

export async function clearDemoReviews(pool) {
  const [result] = await pool.query('DELETE FROM book_reviews WHERE is_demo = 1');
  return result.affectedRows;
}
