// node --test scripts/story/room.test.mjs — сценарна кімната без мережі (GAME-198).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftName, outputOf, parseBrief } from './room.mjs';

test('бриф: моделі й текст обов\'язкові; текст можна взяти з файлу поруч', () => {
  assert.deepEqual(parseBrief('{"models":["a/b"],"prompt":"хай"}', () => ''), { models: ['a/b'], system: '', prompt: 'хай' });
  assert.equal(parseBrief('{"models":["a/b"],"prompt_file":"x.md"}', (p) => (p === 'x.md' ? 'з файлу' : '')).prompt, 'з файлу');
  assert.throws(() => parseBrief('{"models":[],"prompt":"хай"}', () => ''), /models/);
  assert.throws(() => parseBrief('{"models":["a/b"],"prompt":"  "}', () => ''), /порожній prompt/);
});

test('порожня відповідь або помилка моделі — збій, а не тихий успіх', () => {
  assert.equal(outputOf({ output: 'сцена' }), 'сцена');
  assert.throws(() => outputOf({ output: '' }), /порожня/);
  assert.throws(() => outputOf({ output: '   \n' }), /порожня/);
  assert.throws(() => outputOf({}), /порожня/);
  assert.throws(() => outputOf({ output: 'x', error: 'rate limit' }), /помилку/);
});

test('ім\'я чернетки з назви моделі — без скісних рисок', () => {
  assert.equal(draftName('openai/gpt-5-chat'), 'openai--gpt-5-chat.md');
  assert.equal(draftName('google/gemini-2.5-pro'), 'google--gemini-2.5-pro.md');
});
