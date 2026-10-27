import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const assets = fileURLToPath(new URL('../../../../public/categories/', import.meta.url));
const expected = [
  'fiction.svg', 'fantasy.svg', 'science-fiction.svg', 'mystery.svg', 'romance.svg', 'history.svg',
  'biography.svg', 'philosophy.svg', 'poetry.svg', 'childrens-books.svg', 'computing.svg', 'science.svg',
  'psychology.svg', 'business.svg', 'travel.svg', 'adventure.svg', 'classics.svg', 'anime-manga.svg',
];

test('each catalogue category has an optimized, local, self-contained illustration', async () => {
  assert.deepEqual((await readdir(assets)).sort(), [...expected, 'anime-manga-dark.svg'].sort());
  for (const file of expected) {
    const [source, details] = await Promise.all([readFile(join(assets, file), 'utf8'), stat(join(assets, file))]);
    assert.match(source, /^<svg\s/);
    assert.match(source, file === 'anime-manga.svg' ? /viewBox="0 0 1600 1000"/ : /viewBox="0 0 1200 800"/);
    assert.doesNotMatch(source, /(?:href|xlink:href|src)=["']https?:\/\//);
    assert.ok(details.size < 12_000, `${file} should remain a compact vector asset`);
  }
  const darkAnime = await readFile(join(assets, 'anime-manga-dark.svg'), 'utf8');
  assert.match(darkAnime, /Japanese mountain and cherry blossom night scene/);
  assert.match(darkAnime, /viewBox="0 0 1600 1000"/);
  assert.doesNotMatch(darkAnime, /(?:href|xlink:href|src)=["']https?:\/\//);
});
