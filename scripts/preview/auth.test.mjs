// node --test scripts/preview/auth.test.mjs — перевірка замка закритого перегляду без мережі.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowed, digest, onRequest } from './auth.mjs';

const b64 = (s) => `Basic ${Buffer.from(s, 'utf8').toString('base64')}`;

test('правильні логін і пароль — пускає; будь-яка розбіжність — ні', async () => {
  const hash = await digest('s1', 'camptribe', 'пароль-123');
  assert.equal(await allowed(b64('camptribe:пароль-123'), 's1', hash), true);
  assert.equal(await allowed(b64('camptribe:пароль-123').replace('Basic', 'basic'), 's1', hash), true);   // схема без огляду на регістр
  assert.equal(await allowed(b64('camptribe:пароль-124'), 's1', hash), false);
  assert.equal(await allowed(b64('Camptribe:пароль-123'), 's1', hash), false);
  assert.equal(await allowed(b64('camptribe:пароль-123'), 's2', hash), false);   // інша сіль
  assert.equal(await allowed(b64('camptribe'), 's1', hash), false);              // без двокрапки
  assert.equal(await allowed('Bearer x', 's1', hash), false);
  assert.equal(await allowed('Basic %%%', 's1', hash), false);
  assert.equal(await allowed(null, 's1', hash), false);
});

test('пароль із двокрапкою: ділимо лише за першою', async () => {
  const hash = await digest('s', 'u', 'a:b:c');
  assert.equal(await allowed(b64('u:a:b:c'), 's', hash), true);
});

test('збірка без підставлених солі й хешу нікого не пускає (503), а не відкриває гру', async () => {
  let passed = false;
  const res = await onRequest({ request: new Request('https://x/'), next: async () => { passed = true; return new Response('GAME'); } });
  assert.equal(res.status, 503);
  assert.equal(passed, false);
});
