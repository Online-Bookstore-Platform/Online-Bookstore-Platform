import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_NAMES, getCategoryBackground } from './backgrounds.js';

test('every seeded category resolves to local light and dark photo assets, including punctuation aliases', () => {
  assert.equal(CATEGORY_NAMES.length, 18);
  for (const name of CATEGORY_NAMES) {
    const background = getCategoryBackground(name);
    assert.ok(background?.light.startsWith('/backgrounds/categories/'), `${name} should use a local light asset`);
    assert.ok(background.light.endsWith('/light.webp'));
    assert.ok(background.dark.startsWith('/backgrounds/categories/'), `${name} should use a local dark asset`);
    assert.ok(background.dark.endsWith('/dark.webp'));
    assert.doesNotMatch(background.light + background.dark, /unsplash|https?:/i);
  }
  assert.equal(getCategoryBackground('Anime & Manga').dark, '/backgrounds/categories/anime-manga/dark.webp');
  assert.equal(getCategoryBackground('Science-Fiction').light, '/backgrounds/categories/science-fiction/light.webp');
  assert.equal(getCategoryBackground('Anime and Manga').light, '/backgrounds/categories/anime-manga/light.webp');
  assert.equal(getCategoryBackground('Childrens Books').light, '/backgrounds/categories/childrens-books/light.webp');
});
