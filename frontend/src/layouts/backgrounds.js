export const CATEGORY_NAMES = ['Fiction', 'Fantasy', 'Science Fiction', 'Mystery', 'Romance', 'History', 'Biography', 'Philosophy', 'Poetry', "Children's Books", 'Computing', 'Science', 'Psychology', 'Business', 'Travel', 'Adventure', 'Classics', 'Anime & Manga'];

const slug = name => String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const assetSlug = name => slug(name).replace('anime-and-manga', 'anime-manga');
const background = (category, theme) => `/backgrounds/${category}/${theme}.webp`;

const SOLID_BACKGROUND_ROUTES = [
  /^\/inventory\/?$/,
  /^\/admin\/?$/,
  /^\/cart\/?$/,
  /^\/(?:payment|checkout)\/?$/,
  /^\/orders(?:\/.*)?$/,
];

export const usesSolidBackground = pathname =>
  SOLID_BACKGROUND_ROUTES.some(route => route.test(pathname));

export const DEFAULT_BACKGROUNDS = {
  light: background('default', 'light'),
  dark: background('default', 'dark'),
};

export const CATEGORY_BACKGROUNDS = Object.fromEntries(CATEGORY_NAMES.map((name, index) => {
  const category = assetSlug(name);
  return [index + 1, { light: background(`categories/${category}`, 'light'), dark: background(`categories/${category}`, 'dark') }];
}));

export const getCategoryBackground = name => {
  const normalized = slug(name).replace('childrens', 'children').replace('and-manga', 'manga');
  const index = CATEGORY_NAMES.findIndex(item => slug(item).replace('childrens', 'children').replace('and-manga', 'manga') === normalized);
  return CATEGORY_BACKGROUNDS[index + 1] || null;
};
