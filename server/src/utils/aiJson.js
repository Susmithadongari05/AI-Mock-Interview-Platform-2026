// ============================================
// aiJson.js - Robust parsing/normalising of model JSON output
// ============================================

export const parseAiJson = (value) => {
  if (value && typeof value === 'object') return value;
  let text = String(value ?? '').trim();
  if (!text) throw new Error('The AI returned an empty response.');

  // Strip Markdown code fences if the model added them.
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const candidates = [text];
  const firstObject = text.indexOf('{');
  const lastObject = text.lastIndexOf('}');
  if (firstObject >= 0 && lastObject > firstObject) candidates.push(text.slice(firstObject, lastObject + 1));
  const firstArray = text.indexOf('[');
  const lastArray = text.lastIndexOf(']');
  if (firstArray >= 0 && lastArray > firstArray) candidates.push(text.slice(firstArray, lastArray + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }
  throw new Error('The AI returned a response that is not valid JSON.');
};

export const clampScore = (value, fallback = 0) => {
  const number = Number(value);
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(number) ? number : fallback)));
};

const asStringList = (value) =>
  (Array.isArray(value) ? value : []).map((item) => String(item ?? '').trim()).filter(Boolean);

const CATEGORY_KEYS = ['communicationSkills', 'technicalKnowledge', 'problemSolving', 'codeQuality', 'confidence'];

/**
 * Validate and normalise the feedback object produced by the model.
 * Scores are clamped to 0-100. Nothing is invented: if the model omitted a
 * category, it is simply left out (and reported via `missingCategories`).
 * The overall score is the model's value when valid; otherwise the average of
 * the category scores that exist.
 */
export const normalizeFeedback = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('The AI returned an invalid feedback object.');
  }

  const categoryScores = {};
  const missingCategories = [];
  const rawCategories = raw.categoryScores && typeof raw.categoryScores === 'object' ? raw.categoryScores : {};
  for (const key of CATEGORY_KEYS) {
    const entry = rawCategories[key];
    if (entry && entry.score !== undefined && Number.isFinite(Number(entry.score))) {
      categoryScores[key] = { score: clampScore(entry.score), comment: String(entry.comment ?? '').trim() };
    } else {
      missingCategories.push(key);
    }
  }

  let overallScore;
  if (raw.overallScore !== undefined && Number.isFinite(Number(raw.overallScore))) {
    overallScore = clampScore(raw.overallScore);
  } else {
    const scores = Object.values(categoryScores).map((c) => c.score);
    if (!scores.length) throw new Error('The AI feedback contained no usable scores.');
    overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  return {
    overallScore,
    categoryScores,
    strengths: asStringList(raw.strengths),
    areasOfImprovement: asStringList(raw.areasOfImprovement || raw.areasForImprovement),
    finalAssessment: String(raw.finalAssessment || raw.summary || '').trim(),
    ...(missingCategories.length ? { missingCategories } : {}),
  };
};
