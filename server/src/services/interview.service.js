
import mongoose from 'mongoose';
import Interview from '../models/Interview.model.js';
import { askGemini } from './geminiService.js';
import { transcribeAudio } from './assemblyai.service.js';
import { generateSpeech } from './murf.service.js';

const parseGeminiJSON = value => {
  if (value && typeof value === 'object') return value;

  const text = String(value || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');

  if (firstBrace < 0 || lastBrace < firstBrace) {
    throw new Error('Gemini returned an invalid JSON response.');
  }

  return JSON.parse(text.slice(firstBrace, lastBrace + 1));
};

const makeError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const findOwnedInterview = async (interviewId, userId) => {
  if (!mongoose.isValidObjectId(interviewId)) {
    throw makeError('Invalid interview ID.', 400);
  }

  const interview = await Interview.findOne({
    _id: interviewId,
    userId,
  });

  if (!interview) {
    throw makeError('Interview not found.', 404);
  }

  return interview;
};

const normalizeQuestion = (question, index) => {
  const text = String(
    question?.text || question?.question || '',
  ).trim();

  if (!text) return null;

  const rawType = String(
    question?.type || 'technical',
  ).toLowerCase();

  const isCodeQuestion =
    question?.isCodeQuestion === true ||
    ['coding', 'code', 'programming'].includes(rawType);

  return {
    text,
    type: isCodeQuestion ? 'coding' : rawType,
    isCodeQuestion,
    ...(question?.topic ? { topic: String(question.topic) } : {}),
    order: index + 1,
  };
};

// ============================================
// START INTERVIEW
// ============================================

export const startInterview = async (
  userId,
  role,
  difficulty,
  resumeText,
  totalQuestions = 5,
) => {
  const startTime = Date.now();

  if (!role || !difficulty || !String(resumeText || '').trim()) {
    throw makeError(
      'Role, difficulty, and resume text are required.',
    );
  }

  const count = Math.min(
    15,
    Math.max(1, Number.parseInt(totalQuestions, 10) || 5),
  );

  const prompt = `
You are an experienced technical interviewer.

Create exactly ${count} interview questions for a candidate
applying for the role "${role}" at ${difficulty} difficulty.

Personalize questions to the resume, but do not invent skills
that are not present.

Include a sensible mix of resume-based and role-specific questions.

Return ONLY valid JSON:
{
  "questions": [
    {
      "text": "Question text",
      "type": "technical",
      "isCodeQuestion": false,
      "topic": "Topic"
    }
  ]
}

Resume:
${String(resumeText).slice(0, 12000)}
`;

  let parsed;

  // Measure Gemini response time and JSON parsing time.
  try {
    const geminiStart = Date.now();

    const geminiResponse = await askGemini(prompt);

    console.log(
      `[Start Interview] Gemini response time: ${
        Date.now() - geminiStart
      } ms`,
    );

    const parseStart = Date.now();

    parsed = parseGeminiJSON(geminiResponse);

    console.log(
      `[Start Interview] JSON parsing time: ${
        Date.now() - parseStart
      } ms`,
    );
  } catch (error) {
    console.error(
      `[Start Interview] Generation failed after ${
        Date.now() - startTime
      } ms:`,
      error.message,
    );

    throw makeError(
      `Could not generate interview questions: ${error.message}`,
      502,
    );
  }

  const questions = (
    Array.isArray(parsed) ? parsed : parsed.questions || []
  )
    .map(normalizeQuestion)
    .filter(Boolean)
    .slice(0, count);

  if (questions.length === 0) {
    throw makeError(
      'The AI did not return valid interview questions.',
      502,
    );
  }

  // Measure MongoDB save time.
  const dbStart = Date.now();

  const interview = await Interview.create({
    userId,
    role: String(role),
    difficulty: String(difficulty),
    resumeText: String(resumeText),
    totalQuestions: questions.length,
    questions,
    answers: [],
    codeSubmissions: [],
    status: 'in-progress',
  });

  console.log(
    `[Start Interview] MongoDB save time: ${
      Date.now() - dbStart
    } ms`,
  );

  console.log(
    `[Start Interview] Total startup time: ${
      Date.now() - startTime
    } ms`,
  );

  return {
    interviewId: interview._id,
    role: interview.role,
    difficulty: interview.difficulty,
    totalQuestions: interview.totalQuestions,
    questions: interview.questions,
    status: interview.status,
  };
};

// ============================================
// GET INTERVIEW
// ============================================

export const getInterview = async (interviewId, userId) => {
  const interview = await findOwnedInterview(interviewId, userId);
  const result = interview.toObject();

  result.questions = (result.questions || []).map(
    (question, index) => ({
      ...question,
      answer: result.answers?.[index]?.answer || '',
      codeAnswer:
        result.answers?.[index]?.type === 'code'
          ? result.answers[index].answer
          : '',
    }),
  );

  return result;
};

// ============================================
// TEXT-TO-SPEECH: INTERVIEW QUESTION
// ============================================

export const speakQuestion = async (
  interviewId,
  userId,
  questionIndex,
) => {
  const interview = await findOwnedInterview(interviewId, userId);

  const index = Number(questionIndex);

  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= interview.questions.length
  ) {
    throw makeError('Invalid question index.', 400);
  }

  const question = interview.questions[index];

  const questionText = String(
    typeof question === 'string'
      ? question
      : question?.text || question?.question || '',
  ).trim();

  if (!questionText) {
    throw makeError('Question text is not available.', 404);
  }

  const audioUrl = await generateSpeech(questionText);

  if (!audioUrl) {
    throw makeError(
      'Murf did not return an audio URL.',
      502,
    );
  }

  return { audioUrl };
};

// ============================================
// TEXT-TO-SPEECH: CANDIDATE ANSWER
// ============================================

export const speakAnswer = async (
  interviewId,
  userId,
  answer,
) => {
  await findOwnedInterview(interviewId, userId);

  const answerText = String(answer || '').trim();

  if (!answerText) {
    throw makeError(
      'Please enter an answer before generating speech.',
    );
  }

  const audioUrl = await generateSpeech(answerText);

  if (!audioUrl) {
    throw makeError(
      'Murf did not return an audio URL.',
      502,
    );
  }

  return { audioUrl };
};

// ============================================
// SAVE ANSWER AND GET NEXT QUESTION
// ============================================

const saveAnswerAndGetNext = async (
  interview,
  answerText,
  type,
  language = '',
) => {
  if (interview.status === 'completed') {
    throw makeError('This interview is already completed.', 409);
  }

  const currentIndex = interview.answers.length;

  if (currentIndex >= interview.questions.length) {
    return {
      completed: true,
      question: null,
      currentQuestion: currentIndex,
      totalQuestions: interview.questions.length,
    };
  }

  interview.answers.push({
    type,
    answer: answerText,
    language,
  });

  await interview.save();

  const nextIndex = interview.answers.length;
  const completed = nextIndex >= interview.questions.length;

  return {
    completed,
    question: completed ? null : interview.questions[nextIndex],
    currentQuestion: nextIndex,
    totalQuestions: interview.questions.length,
    saved: true,
  };
};

// ============================================
// SUBMIT TEXT ANSWER
// ============================================

export const submitTextAnswer = async (
  interviewId,
  userId,
  answer,
) => {
  if (!String(answer || '').trim()) {
    throw makeError('Please provide an answer.');
  }

  const interview = await findOwnedInterview(interviewId, userId);

  return saveAnswerAndGetNext(
    interview,
    String(answer).trim(),
    'text',
  );
};

// ============================================
// SUBMIT CODE ANSWER
// ============================================

export const submitCodeAnswer = async (
  interviewId,
  userId,
  code,
  language,
) => {
  if (!String(code || '').trim()) {
    throw makeError('Please provide code to submit.');
  }

  const interview = await findOwnedInterview(interviewId, userId);

  if (interview.status === 'completed') {
    throw makeError('This interview is already completed.', 409);
  }

  const codeText = String(code);
  const codeLanguage = String(language || 'unspecified');

  let evaluation = {
    status: 'unavailable',
    note:
      'AI code review could not be generated. ' +
      'The submission was saved, but it was not executed.',
  };

  try {
    const review = parseGeminiJSON(
      await askGemini(`
Review this ${codeLanguage} interview solution.

Do not claim that you executed the code.
Assess the logic by inspection only.

Return ONLY valid JSON:
{
  "correctness": "likely correct",
  "score": 0,
  "timeComplexity": "unknown",
  "spaceComplexity": "unknown",
  "feedback": "Specific feedback",
  "issues": [],
  "suggestedImprovements": []
}

CODE:
${codeText.slice(0, 12000)}
`),
    );

    const rawScore = Number(review.score);

    evaluation = {
      ...review,
      score: Math.max(
        0,
        Math.min(
          100,
          Math.round(Number.isFinite(rawScore) ? rawScore : 0),
        ),
      ),
      status: 'reviewed',
      note:
        'AI review by code inspection only; ' +
        'the code was not executed in a sandbox.',
    };
  } catch (error) {
    console.error('AI code review failed:', error.message);
  }

  interview.codeSubmissions.push({
    code: codeText,
    language: codeLanguage,
    evaluation,
  });

  const result = await saveAnswerAndGetNext(
    interview,
    codeText,
    'code',
    codeLanguage,
  );

  return { ...result, codeEvaluation: evaluation };
};

// ============================================
// SUBMIT AUDIO ANSWER
// ============================================

export const submitAudioAnswer = async (
  interviewId,
  userId,
  file,
) => {
  if (!file?.buffer) {
    throw makeError('No audio file was uploaded.');
  }

  const interview = await findOwnedInterview(interviewId, userId);
  let transcript;

  try {
    transcript = await transcribeAudio(file.buffer);
  } catch (error) {
    throw makeError(
      `Audio transcription failed: ${error.message}`,
      502,
    );
  }

  if (!String(transcript || '').trim()) {
    throw makeError('No speech could be detected in the recording.');
  }

  const result = await saveAnswerAndGetNext(
    interview,
    transcript.trim(),
    'audio',
  );

  return { ...result, transcript: transcript.trim() };
};

// ============================================
// TRANSCRIBE AUDIO WITHOUT SAVING AN ANSWER
// ============================================

export const transcribeAudioAnswer = async file => {
  if (!file?.buffer) {
    throw makeError('No audio file was uploaded.');
  }

  try {
    return { text: await transcribeAudio(file.buffer) };
  } catch (error) {
    throw makeError(
      `Audio transcription failed: ${error.message}`,
      502,
    );
  }
};

// ============================================
// FEEDBACK HELPERS
// ============================================

const isFallbackFeedback = feedback => {
  if (!feedback || typeof feedback !== 'object') return true;

  const assessment = String(
    feedback.finalAssessment || '',
  ).toLowerCase();

  return (
    assessment.includes('fallback evaluation') ||
    assessment.includes('basic fallback') ||
    assessment.includes('ai feedback was unavailable')
  );
};

const clampScore = value => {
  const score = Number(value);

  return Math.max(
    0,
    Math.min(100, Math.round(Number.isFinite(score) ? score : 0)),
  );
};

const normalizeCategory = (category, label) => {
  if (!category || typeof category !== 'object') {
    return {
      score: 0,
      comment:
        `${label} could not be evaluated from the ` +
        'response returned by the AI. Please regenerate feedback.',
    };
  }

  return {
    ...category,
    score: clampScore(category.score),
    comment: String(
      category.comment ||
        `No specific ${label.toLowerCase()} feedback was provided.`,
    ),
  };
};

// ============================================
// END INTERVIEW AND GENERATE AI FEEDBACK
// ============================================

export const endInterview = async (interviewId, userId) => {
  const interview = await findOwnedInterview(interviewId, userId);

  if (
    interview.status === 'completed' &&
    interview.feedback &&
    !isFallbackFeedback(interview.feedback)
  ) {
    return {
      interviewId: interview._id,
      feedback: interview.feedback,
      overallScore: interview.overallScore ?? interview.score ?? 0,
    };
  }

  const questions = Array.isArray(interview.questions)
    ? interview.questions
    : [];

  const answers = Array.isArray(interview.answers)
    ? interview.answers
    : [];

  if (answers.length === 0) {
    throw makeError(
      'Submit an answer before ending the interview.',
      400,
    );
  }

  const interviewContent = questions
    .map((question, index) => {
      const answer = answers[index];

      return [
        `QUESTION ${index + 1}: ${String(
          question?.text || question?.question || 'Question unavailable',
        )}`,
        `QUESTION TYPE: ${String(question?.type || 'technical')}`,
        `CANDIDATE ANSWER: ${String(
          answer?.answer || 'No answer provided',
        )}`,
        answer?.language ? `LANGUAGE: ${answer.language}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n----------------------------------------\n\n');

  const codeSubmissionsSummary = (
    Array.isArray(interview.codeSubmissions)
      ? interview.codeSubmissions
      : []
  )
    .map((submission, index) =>
      [
        `CODE SUBMISSION ${index + 1}`,
        `LANGUAGE: ${submission.language || 'Not specified'}`,
        `CODE:\n${String(submission.code || '').slice(0, 8000)}`,
        `EXISTING AI REVIEW: ${JSON.stringify(
          submission.evaluation || {},
        )}`,
      ].join('\n'),
    )
    .join('\n\n----------------------------------------\n\n');

  const feedbackPrompt = `
You are an experienced technical interviewer evaluating
a candidate for the role "${interview.role}" at
${interview.difficulty} difficulty.

Evaluate the actual answers below.
Do not reward an answer just because it is long.
Judge correctness, relevance, depth, reasoning, clarity, and examples.
Do not invent evidence.
If an answer is empty or says the candidate does not know, score it accordingly.
If no code was submitted, state that code quality cannot be assessed.

INTERVIEW QUESTIONS AND ANSWERS:
${interviewContent}

${
  codeSubmissionsSummary
    ? `CODE SUBMISSIONS:\n${codeSubmissionsSummary}`
    : 'NO CODE SUBMISSIONS WERE PROVIDED.'
}

Return ONLY valid JSON, without Markdown fences, using this structure:
{
  "overallScore": 75,
  "categoryScores": {
    "communicationSkills": {
      "score": 80,
      "comment": "Specific evidence-based comment."
    },
    "technicalKnowledge": {
      "score": 70,
      "comment": "Specific evidence-based comment."
    },
    "problemSolving": {
      "score": 75,
      "comment": "Specific evidence-based comment."
    },
    "codeQuality": {
      "score": 0,
      "comment": "State whether code was provided."
    },
    "confidence": {
      "score": 75,
      "comment": "Use only confidence signals observable in the answers."
    }
  },
  "strengths": [
    "A specific strength tied to an actual answer"
  ],
  "areasOfImprovement": [
    "A specific weakness and a practical way to improve it"
  ],
  "finalAssessment": "A concise, realistic assessment."
}

All scores must be integers from 0 to 100.
Every category comment must refer to the candidate's actual responses.
Include at least two strengths and two improvement suggestions when evidence allows.
Do not return a generic template.
`;

  let feedback;

  try {
    feedback = parseGeminiJSON(await askGemini(feedbackPrompt));
  } catch (error) {
    console.error(
      '[End Interview] Gemini feedback generation failed:',
      error.message,
    );

    throw makeError(
      `Unable to generate AI interview feedback: ${error.message}`,
      502,
    );
  }

  if (
    !feedback ||
    typeof feedback !== 'object' ||
    Array.isArray(feedback)
  ) {
    throw makeError(
      'Gemini returned an invalid feedback response. Please retry.',
      502,
    );
  }

  const overallScoreValue = Number(feedback.overallScore);

  if (!Number.isFinite(overallScoreValue)) {
    throw makeError(
      'Gemini feedback did not contain a valid overall score. Please retry.',
      502,
    );
  }

  const categoryScores = feedback.categoryScores || {};

  feedback = {
    ...feedback,
    overallScore: clampScore(overallScoreValue),
    categoryScores: {
      communicationSkills: normalizeCategory(
        categoryScores.communicationSkills,
        'Communication skills',
      ),
      technicalKnowledge: normalizeCategory(
        categoryScores.technicalKnowledge,
        'Technical knowledge',
      ),
      problemSolving: normalizeCategory(
        categoryScores.problemSolving,
        'Problem solving',
      ),
      codeQuality: normalizeCategory(
        categoryScores.codeQuality,
        'Code quality',
      ),
      confidence: normalizeCategory(
        categoryScores.confidence,
        'Confidence',
      ),
    },
    strengths: Array.isArray(feedback.strengths)
      ? feedback.strengths.map(String)
      : [],
    areasOfImprovement: Array.isArray(feedback.areasOfImprovement)
      ? feedback.areasOfImprovement.map(String)
      : [],
    finalAssessment: String(
      feedback.finalAssessment ||
        'Assessment generated from the submitted interview answers.',
    ),
  };

  const overallScore = feedback.overallScore;

  interview.set('feedback', feedback);
  interview.overallScore = overallScore;
  interview.score = overallScore;
  interview.status = 'completed';
  interview.completedAt = interview.completedAt || new Date();

  await interview.save();

  console.log(
    `[End Interview] AI feedback saved for ${interview._id}; score: ${overallScore}`,
  );

  return {
    interviewId: interview._id,
    feedback: interview.feedback,
    overallScore,
  };
};

// ============================================
// GET INTERVIEW FEEDBACK
// ============================================

export const getFeedback = async (interviewId, userId) => {
  const interview = await findOwnedInterview(interviewId, userId);

  return {
    interviewId: interview._id,
    score: interview.overallScore ?? interview.score ?? 0,
    overallScore: interview.overallScore ?? interview.score ?? 0,
    feedback: interview.feedback || null,
    status: interview.status,
  };
};
