// node --test scripts/research/refs.test.mjs — фільтр ліцензій референсів без мережі (GAME-197).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditLine, freeLicense, pick } from './refs.mjs';

test('вільні ліцензії проходять, невільні й невідомі — ні', () => {
  for (const l of ['CC0', 'Public domain', 'PD-self', 'CC BY 4.0', 'CC BY-SA 3.0', 'CC BY-SA 2.0', 'cc-by-sa-4.0']) assert.equal(freeLicense(l), true, l);
  for (const l of ['', undefined, 'Fair use', 'All rights reserved', 'CC BY-NC 2.0', 'CC BY-ND 4.0', 'CC BY-NC-SA 3.0']) assert.equal(freeLicense(l), false, String(l));
});

test('з відповіді Commons беремо лише вільні фото з мініатюрою, автор без HTML', () => {
  const json = { query: { pages: {
    1: { title: 'File:Shop.jpg', imageinfo: [{ thumburl: 'https://u/640px-Shop.jpg', descriptionurl: 'https://c/File:Shop.jpg', extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: '<a href="x">Anna</a>' } } }] },
    2: { title: 'File:NC.jpg', imageinfo: [{ thumburl: 'https://u/nc.jpg', extmetadata: { LicenseShortName: { value: 'CC BY-NC 2.0' } } }] },
    3: { title: 'File:NoThumb.jpg', imageinfo: [{ extmetadata: { LicenseShortName: { value: 'CC0' } } }] },
  } } };
  const got = pick(json);
  assert.equal(got.length, 1);
  assert.deepEqual(got[0], { title: 'File:Shop.jpg', thumb: 'https://u/640px-Shop.jpg', page: 'https://c/File:Shop.jpg', license: 'CC BY-SA 4.0', author: 'Anna' });
  assert.equal(creditLine(got[0], 'ref00.jpg'), 'ref00.jpg\tFile:Shop.jpg\tAnna\tCC BY-SA 4.0\thttps://c/File:Shop.jpg');
});
