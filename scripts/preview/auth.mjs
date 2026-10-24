// Закритий перегляд (рішення власника 23.10.2026, варіант «логін і пароль»): Basic-авторизацію перевіряє сервер
// Cloudflare (Pages Functions middleware), а не гра — у браузер без пароля не потрапляє жоден файл збірки.
//
// Пароля в репозиторії немає (він публічний). CI підставляє в копію цього файлу лише СІЛЬ і SHA-256 від
// «сіль:логін:пароль»; сам файл функції Cloudflare не віддає як статику. Порівняння — без раннього виходу.

const enc = new TextEncoder();

export async function digest(salt, user, pass) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(`${salt}:${user}:${pass}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Рядки однакової довжини порівнюються повністю, хоч би де була перша розбіжність. */
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Заголовок Authorization → чи пускати. Будь-яка зламана форма — ні. */
export async function allowed(header, salt, hash) {
  if (typeof header !== 'string' || !/^basic /i.test(header)) return false;
  let plain;
  // atob дає байти; браузери шлють логін і пароль у UTF-8 (charset="UTF-8" у виклику), тож кирилиця теж працює.
  try { plain = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(header.slice(6).trim()), (c) => c.charCodeAt(0))); } catch { return false; }
  const i = plain.indexOf(':');
  if (i < 0) return false;
  return same(await digest(salt, plain.slice(0, i), plain.slice(i + 1)), hash);
}

const SALT = '__PREVIEW_SALT__';
const HASH = '__PREVIEW_HASH__';

export async function onRequest(context) {
  // Незамінені мітки — збірка без пароля: нікого не пускаємо (краще закрито, ніж відкрито).
  if (SALT.startsWith('__') || HASH.startsWith('__')) return new Response('Preview is not configured', { status: 503 });
  if (await allowed(context.request.headers.get('Authorization'), SALT, HASH)) {
    const res = await context.next();
    const out = new Response(res.body, res);
    out.headers.set('Cache-Control', 'private, no-store');
    out.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return out;
  }
  return new Response('Потрібен вхід / Login required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="CampTribe preview", charset="UTF-8"', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
