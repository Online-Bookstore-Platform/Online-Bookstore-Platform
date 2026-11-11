// Fictional editorial examples for local classroom presentations. They are
// clearly marked as samples and never presented as customer/purchaser reviews.
const reviewers = [
  'Mira Sen','Arjun Rao','Leela Nair','Kabir Mehta','Tara Iyer','Dev Malhotra',
  'Nisha Kapoor','Rohan Das','Ananya Bose','Ishaan Kulkarni','Pooja Menon','Sameer Ali',
  'Aditi Shah','Neel Banerjee','Farah Khan','Vikram Joshi','Sana Qureshi','Kavya Pillai',
  'Ritwik Ghosh','Meera Krishnan','Zoya Fernandes','Aditya Menon','Ira Chatterjee','Karan Bhat',
  'Diya Mukherjee','Neil Dutta','Sonal Verma','Rehan Siddiqui','Anika Rao','Manav Sethi',
  'Rhea Thomas','Yash Kapoor','Noor Hussain','Tanishka Roy','Aarav Kulkarni','Simran Gill',
  'Ishita Das','Parth Shah','Maya Fernandes','Om Prakash',
];
const openings = [
  'I picked this up expecting a quick read and found myself slowing down to enjoy the sentences.',
  'The strongest part for me was how naturally the people and place came to life.',
  'This was a thoughtful companion for a few quiet evenings, with several moments that stayed with me.',
  'I liked the central idea more than I expected to, especially once the story found its rhythm.',
  'There is a lot of care in the details here; small observations often do more than the big scenes.',
  'A lively, readable book with a point of view that feels personal rather than polished smooth.',
  'I read this between other things and kept looking forward to returning to it.',
  'The premise drew me in, and the voice is what kept me turning the pages.',
  'Some passages feel made for rereading, even when the overall pace is unhurried.',
  'I appreciated that the book leaves a little room for the reader to think things through.',
  'This is at its best when it focuses on everyday choices and their quiet consequences.',
  'A memorable setting and a clear voice give this book its own character.',
];
const middles = [
  'The middle section takes its time, but the extra space gives the characters room to change.',
  'A couple of transitions felt abrupt to me, though the main thread remained easy to follow.',
  'I especially enjoyed the smaller conversations; they made the larger turns feel earned.',
  'The tone is gentle without becoming vague, and the details are easy to picture.',
  'It did not all land equally for me, but there is enough here to invite a second look.',
  'The pacing shifts a little, so this worked better for me in short sittings than in one stretch.',
  'I found the ideas more compelling than the plot, which may be exactly what some readers want.',
  'The ending is restrained and felt true to the mood the book had built.',
  'A few choices surprised me in a good way, and I liked that the book did not explain every one.',
  'The writing stays clear even when the subject gets complicated.',
  'I wanted one thread to go further, but the book gives its other questions a satisfying amount of space.',
  'It has an inviting quality that makes it easy to recommend to the right reader.',
];
const closings = [
  'I would happily pass it to a friend who enjoys character-led reads.',
  'Not quite a new favourite, but still a rewarding use of an afternoon.',
  'I came away with a few lines and images I will remember.',
  'A good choice when you want something warm, considered, and unhurried.',
  'Readers who prefer a brisk plot may feel the pace, but I liked the quieter approach.',
  'I am glad I gave it a chance and would read another book by this author.',
  'It left me curious to hear what other readers make of it.',
  'There are flaws, though the book has enough personality to make them forgivable.',
  'A solid recommendation for a relaxed weekend read.',
  'I enjoyed it more as it went along and finished on a thoughtful note.',
  'This one will probably suit readers who like atmosphere as much as action.',
  'A distinctive little reading experience that stayed with me longer than expected.',
];
const asides = [
  'I kept a few notes in the margin, which I rarely do.',
  'It is the sort of book I would discuss over coffee rather than summarize quickly.',
  'My favourite detail was how the mood changed without a big announcement.',
  'I would have liked a little more context in one section, but it did not spoil the read.',
  'The prose has a nice spoken quality in places.',
  'I read the last few pages twice to sit with the ending.',
  'It is not trying to please everyone, and I appreciated that.',
  'A few uneven pages are outweighed by the moments that work.',
];
const ratings = [5,4,5,3,4,5,4,3,5,2,4,5,3,4,5,4,1,5,3,4,5,2,4,5,3,4,5,4,3,5,4,5,2,4,5,3];

function stableHash(value) {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function buildDemoReviews(identity) {
  const seed = stableHash(identity.key);
  const count = 30 + (seed % 11); // 30–40 reviews for each local catalogue book.
  return Array.from({ length: count }, (_, index) => {
    const shift = (seed + index * 7) >>> 0;
    const pieces = [openings[shift % openings.length]];
    if (index % 3 !== 0) pieces.push(middles[(shift >>> 4) % middles.length]);
    pieces.push(closings[(shift >>> 9) % closings.length]);
    if (index % 3 === 2) pieces.push(asides[(shift >>> 14) % asides.length]);
    const date = new Date(Date.UTC(2025, 0, 1) + ((shift + index * 17) % 640) * 86400000);
    return {
      index,
      name: reviewers[(index + (seed % reviewers.length)) % reviewers.length],
      rating: ratings[(index + (seed % ratings.length)) % ratings.length],
      content: pieces.join(' '),
      createdAt: date.toISOString().slice(0, 19).replace('T', ' '),
    };
  });
}

export async function ensureDemoReviews(pool, identity) {
  const rows = buildDemoReviews(identity);
  // Retire only this feature's original 8–12 row preview set during upgrade.
  await pool.query('DELETE FROM book_reviews WHERE book_id = ? AND is_demo = 1 AND demo_key LIKE ?', [identity.key, `${identity.key}:folio-preview:%`]);
  const values = rows.map(row => [identity.key, identity.localId, `${identity.key}:folio-presentation:${row.index + 1}`, row.name, row.rating, row.content, row.createdAt]);
  await pool.query(`INSERT INTO book_reviews
    (book_id, local_book_id, user_id, is_demo, demo_key, demo_label, rating, content, created_at)
    VALUES ? ON DUPLICATE KEY UPDATE demo_label = VALUES(demo_label), rating = VALUES(rating), content = VALUES(content), created_at = VALUES(created_at)`,
  [values.map(([bookId, localBookId, demoKey, name, rating, content, createdAt]) => [bookId, localBookId, null, 1, demoKey, name, rating, content, createdAt])]);
}

export async function clearDemoReviews(pool) {
  const [result] = await pool.query('DELETE FROM book_reviews WHERE is_demo = 1');
  return result.affectedRows;
}
