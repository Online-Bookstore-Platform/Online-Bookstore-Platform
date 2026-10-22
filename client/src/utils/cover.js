// Books in the catalogue have no photographs, so every book gets a typographic
// cover: a colour per category, with one of three layouts picked from the id.

const KNOWN_CATEGORY_COLOURS = {
  Classics: '#7a1f2b',
  'Science Fiction': '#0f5c63',
  Mystery: '#3b2a5c',
  Adventure: '#a8661a',
  Horror: '#25382e',
  Poetry: '#a63f65',
  'Non-Fiction': '#34506b',
};

// Used for categories an admin adds later: picked from the name, so it stays stable.
const FALLBACK_COLOURS = ['#5b3a29', '#2f4858', '#6b2d5c', '#3d5a3a', '#8c3b2a', '#3a4a7a', '#6a5a1f'];

function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

export function coverColour(categoryName) {
  return KNOWN_CATEGORY_COLOURS[categoryName] ?? FALLBACK_COLOURS[hash(categoryName) % FALLBACK_COLOURS.length];
}

export function coverLayout(bookId) {
  return ['top', 'middle', 'initial'][bookId % 3];
}
