// node --test scripts/research/refs.test.mjs — фільтр ліцензій референсів без мережі (GAME-197).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditLine, freeLicense, photo, pick, pickOpenverse } from './refs.mjs';

test('вільні ліцензії проходять, невільні й невідомі — ні', () => {
  for (const l of ['CC0', 'Public domain', 'PD-self', 'CC BY 4.0', 'CC BY-SA 3.0', 'CC BY-SA 2.0', 'cc-by-sa-4.0']) assert.equal(freeLicense(l), true, l);
  for (const l of ['', undefined, 'Fair use', 'All rights reserved', 'CC BY-NC 2.0', 'CC BY-ND 4.0', 'CC BY-NC-SA 3.0']) assert.equal(freeLicense(l), false, String(l));
});

test('з відповіді Commons беремо лише вільні фото з мініатюрою, автор без HTML', () => {
  const json = { query: { pages: {
    1: { title: 'File:Shop.jpg', imageinfo: [{ mime: 'image/jpeg', thumburl: 'https://u/640px-Shop.jpg', descriptionurl: 'https://c/File:Shop.jpg', extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: '<a href="x">Anna</a>' } } }] },
    2: { title: 'File:NC.jpg', imageinfo: [{ thumburl: 'https://u/nc.jpg', extmetadata: { LicenseShortName: { value: 'CC BY-NC 2.0' } } }] },
    4: { title: 'File:Report 1962.pdf', imageinfo: [{ mime: 'application/pdf', thumburl: 'https://u/page1-640px-Report.pdf.jpg', extmetadata: { LicenseShortName: { value: 'Public domain' } } }] },
    5: { title: 'File:Book.djvu', imageinfo: [{ mime: 'image/vnd.djvu', thumburl: 'https://u/book.jpg', extmetadata: { LicenseShortName: { value: 'Public domain' } } }] },
    3: { title: 'File:NoThumb.jpg', imageinfo: [{ extmetadata: { LicenseShortName: { value: 'CC0' } } }] },
  } } };
  const got = pick(json);
  assert.equal(got.length, 1);
  assert.deepEqual(got[0], { title: 'File:Shop.jpg', thumb: 'https://u/640px-Shop.jpg', page: 'https://c/File:Shop.jpg', license: 'CC BY-SA 4.0', author: 'Anna' });
  assert.equal(creditLine(got[0], 'ref00.jpg'), 'ref00.jpg\tFile:Shop.jpg\tAnna\tCC BY-SA 4.0\thttps://c/File:Shop.jpg');
});

test('лише фото: PDF, DjVu, TIFF і SVG — не референс', () => {
  assert.equal(photo('File:Camp.jpg', 'image/jpeg'), true);
  assert.equal(photo('File:Shop.png', 'image/png'), true);
  assert.equal(photo('File:Report.pdf', 'application/pdf'), false);
  assert.equal(photo('File:Book.djvu', 'image/vnd.djvu'), false);
  assert.equal(photo('File:Scan.tif', 'image/tiff'), false);
  assert.equal(photo('File:Camp.jpg', undefined), false);
});

test('Openverse: беремо лише cc0/pdm/by/by-sa фото з мініатюрою; NC і ND — ні', () => {
  const got = pickOpenverse({ results: [
    { id: '1', title: 'Camping shop', license: 'by-sa', license_version: '2.0', creator: 'Jan', thumbnail: 'https://t/1', foreign_landing_url: 'https://f/1', filetype: 'jpg' },
    { id: '2', title: 'NC', license: 'by-nc', thumbnail: 'https://t/2', filetype: 'jpg' },
    { id: '3', title: 'ND', license: 'by-nd', thumbnail: 'https://t/3', filetype: 'jpg' },
    { id: '4', title: 'no thumb', license: 'cc0', filetype: 'jpg' },
  ] });
  assert.deepEqual(got, [{ title: 'Camping shop', thumb: 'https://t/1', page: 'https://f/1', license: 'CC BY-SA 2.0', author: 'Jan' }]);
});
