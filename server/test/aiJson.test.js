import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAiJson, normalizeFeedback, clampScore } from '../src/utils/aiJson.js';

test('parseAiJson handles plain JSON, code fences and surrounding prose', () => {
  assert.deepEqual(parseAiJson('{"a":1}'), { a: 1 });
  assert.deepEqual(parseAiJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseAiJson('Here you go:\n{"a":{"b":2}}\nThanks'), { a: { b: 2 } });
  assert.deepEqual(parseAiJson('[{"text":"q"}]'), [{ text: 'q' }]);
});

test('parseAiJson throws a clear error for empty or non-JSON output', () => {
  assert.throws(() => parseAiJson(''), /empty/i);
  assert.throws(() => parseAiJson('no json here'), /not valid JSON/i);
});

test('clampScore bounds and rounds', () => {
  assert.equal(clampScore(150), 100);
  assert.equal(clampScore(-5), 0);
  assert.equal(clampScore('72.6'), 73);
  assert.equal(clampScore('abc'), 0);
});

test('normalizeFeedback clamps scores and does not invent categories', () => {
  const result = normalizeFeedback({
    overallScore: 140,
    categoryScores: { communicationSkills: { score: 80, comment: 'ok' }, technicalKnowledge: { score: -3 } },
    strengths: ['a', '', null],
    areasForImprovement: ['b'],
    finalAssessment: ' done ',
  });
  assert.equal(result.overallScore, 100);
  assert.equal(result.categoryScores.technicalKnowledge.score, 0);
  assert.equal(result.categoryScores.codeQuality, undefined);
  assert.deepEqual(result.missingCategories, ['problemSolving', 'codeQuality', 'confidence']);
  assert.deepEqual(result.strengths, ['a']);
  assert.deepEqual(result.areasOfImprovement, ['b']);
  assert.equal(result.finalAssessment, 'done');
});

test('normalizeFeedback derives overall score from categories only when missing, and rejects empty feedback', () => {
  const result = normalizeFeedback({ categoryScores: { confidence: { score: 60 }, codeQuality: { score: 80 } } });
  assert.equal(result.overallScore, 70);
  assert.throws(() => normalizeFeedback({}), /no usable scores/);
  assert.throws(() => normalizeFeedback(null), /invalid feedback/);
});
