import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuestion, clampQuestionCount } from '../src/utils/questions.js';

test('normalizeQuestion accepts text/question fields, detects coding questions, and numbers them', () => {
  assert.equal(normalizeQuestion({ text: '  Explain closures ' }, 0).text, 'Explain closures');
  assert.equal(normalizeQuestion({ question: 'Q' }, 1).order, 2);
  assert.equal(normalizeQuestion({ text: 'Write fizzbuzz', type: 'coding' }, 2).isCodeQuestion, true);
  assert.equal(normalizeQuestion({ text: 'x', isCodeQuestion: true }, 0).type, 'coding');
  assert.equal(normalizeQuestion({ text: '' }, 0), null);
});

test('clampQuestionCount keeps the count between 1 and 10 and defaults to 5', () => {
  assert.equal(clampQuestionCount(undefined), 5);
  assert.equal(clampQuestionCount('7'), 7);
  assert.equal(clampQuestionCount(99), 10);
  assert.equal(clampQuestionCount(-3), 1);
});
