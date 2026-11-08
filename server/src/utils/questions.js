// Pure helpers for AI-generated interview questions.

export const normalizeQuestion = (question, index) => {
  const text = String(question?.text || question?.question || '').trim();
  if (!text) return null;
  const rawType = String(question?.type || 'technical').toLowerCase();
  const isCodeQuestion = question?.isCodeQuestion === true ||
    ['coding', 'code', 'programming'].includes(rawType);
  return {
    text,
    type: isCodeQuestion ? 'coding' : (rawType || 'technical'),
    isCodeQuestion,
    ...(question?.topic ? { topic: String(question.topic) } : {}),
    order: index + 1,
  };
};

export const clampQuestionCount = (value) =>
  Math.min(10, Math.max(1, Number.parseInt(value, 10) || 5));

