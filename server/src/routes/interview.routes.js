import { Router } from 'express';

import {
  startInterviewController,
  getInterviewController,
  submitTextAnswer,
  submitCodeAnswer,
  submitAudioAnswer,
  endInterview,
  getFeedbackController,
  transcribeAudioController,
  speakQuestionController,
} from '../controllers/interview.controller.js';

import authenticate from '../middleware/auth.middleware.js';
import { uploadAudio } from '../middleware/upload.middleware.js';
import { requestTimeout } from '../middleware/timeout.middleware.js';

// Routes that call Gemini get a hard deadline (must stay above GEMINI_DEADLINE_MS, default 75 s,
// and below the browser timeout of 100 s).
const AI_ROUTE_TIMEOUT_MS = Number(process.env.AI_ROUTE_TIMEOUT_MS) || 90000;
const aiTimeout = requestTimeout(AI_ROUTE_TIMEOUT_MS, 'The AI service took too long to respond. Please try again in a moment.');

const router = Router();

router.use(authenticate);

// Transcribe an audio clip without attaching it to an interview
router.post('/transcribe', uploadAudio, transcribeAudioController);

// Start interview
router.post('/start', aiTimeout, startInterviewController);

// Submit text answer
router.post('/:id/answer', submitTextAnswer);

// Submit audio answer
router.post('/:id/answer-audio', uploadAudio, submitAudioAnswer);

// Submit code answer
router.post('/:id/code', aiTimeout, submitCodeAnswer);

// End interview
router.post('/:id/end', aiTimeout, endInterview);

// Get interview
router.get('/:id', getInterviewController);

// Murf text-to-speech for one question (index is 0-based)
router.get('/:id/question/:index/speech', speakQuestionController);

// Get feedback
router.get('/:id/feedback', getFeedbackController);

export default router;