import API from './api.js';

const uploadResume = async (file) => {
  const formData = new FormData();
  formData.append('resume', file);

  // Do not set Content-Type manually: the browser must add the multipart boundary itself.
  const response = await API.post('/resume/upload', formData);

  return response.data.data;
};

const getResume = async () => {
  const response = await API.get('/resume');
  return response.data.data;
};

// The server gives up on Gemini after ~75 s and answers within 90 s; the browser waits at most 100 s,
// so the request can never stay "pending" forever. (VITE_START_TIMEOUT_MS is only for testing.)
const START_TIMEOUT_MS = Number(import.meta.env.VITE_START_TIMEOUT_MS) || 100000;

const startInterview = async (
  role,
  difficulty,
  resumeText,
  totalQuestions,
  { signal } = {}
) => {
  const response = await API.post('/interview/start', {
    role,
    difficulty,
    resumeText,
    totalQuestions,
  }, { timeout: START_TIMEOUT_MS, signal });

  return response.data.data;
};

const getInterview = async (interviewId) => {
  const response = await API.get(`/interview/${interviewId}`);
  return response.data.data;
};

const submitTextAnswer = async (interviewId, answer, questionIndex) => {
  const response = await API.post(
    `/interview/${interviewId}/answer`,
    { answer, questionIndex }
  );

  return response.data.data;
};

const submitInterviewAnswer = async (interviewId, answer, questionIndex) =>
  submitTextAnswer(interviewId, answer, questionIndex);

const audioFileName = (blob) =>
  /mp4|m4a|aac/.test(blob?.type || '') ? 'answer.m4a'
    : /ogg/.test(blob?.type || '') ? 'answer.ogg'
    : 'answer.webm';

const submitAudioAnswer = async (interviewId, audioBlob, questionIndex) => {
  const formData = new FormData();
  // Text fields must be appended BEFORE the file so multer sees them in req.body.
  if (questionIndex !== undefined && questionIndex !== null) formData.append('questionIndex', String(questionIndex));
  formData.append('audio', audioBlob, audioFileName(audioBlob));

  const response = await API.post(
    `/interview/${interviewId}/answer-audio`,
    formData
  );

  return response.data.data;
};

const submitInterviewAudio = async (interviewId, audioBlob, questionIndex) =>
  submitAudioAnswer(interviewId, audioBlob, questionIndex);

const submitCode = async (interviewId, code, language, questionIndex) => {
  const response = await API.post(
    `/interview/${interviewId}/code`,
    {
      code,
      language,
      questionIndex,
    }
  );

  return response.data.data;
};

const submitCodeAnswer = async (interviewId, code, language, questionIndex) =>
  submitCode(interviewId, code, language, questionIndex);

const submitInterviewCode = async (interviewId, code, language, questionIndex) =>
  submitCode(interviewId, code, language, questionIndex);

const transcribeAudio = async (audioBlob) => {
  const formData = new FormData();
  formData.append('audio', audioBlob, audioFileName(audioBlob));

  const response = await API.post(
    '/interview/transcribe',
    formData
  );

  return response.data.data;
};

const endInterview = async (interviewId) => {
  const response = await API.post(
    `/interview/${interviewId}/end`
  );

  return response.data.data;
};

const completeInterview = async (interviewId) =>
  endInterview(interviewId);

const getFeedback = async (interviewId) => {
  const response = await API.get(
    `/interview/${interviewId}/feedback`
  );

  return response.data.data;
};

const getInterviewFeedback = async (interviewId) =>
  getFeedback(interviewId);

// Murf text-to-speech for one question (0-based index). Resolves to the audio URL.
const getQuestionSpeech = async (interviewId, questionIndex) => {
  const response = await API.get(
    `/interview/${interviewId}/question/${questionIndex}/speech`
  );

  return response.data.data.audioUrl;
};

export {
  uploadResume,
  getResume,
  startInterview,
  getInterview,
  submitTextAnswer,
  submitInterviewAnswer,
  submitAudioAnswer,
  submitInterviewAudio,
  submitCode,
  submitCodeAnswer,
  submitInterviewCode,
  transcribeAudio,
  endInterview,
  completeInterview,
  getFeedback,
  getInterviewFeedback,
  getQuestionSpeech,
};