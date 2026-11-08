// ============================================
// upload.middleware.js - Multer File Upload Config
// ============================================
// Memory storage; files arrive as Buffer in req.file.buffer.
// Filter errors are given a 400 status so they are not reported as 500s.
// ============================================

import multer from 'multer';

const storage = multer.memoryStorage();

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

const resumeFilter = (req, file, cb) => {
  const isPdf = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname || '');
  if (isPdf) cb(null, true);
  else cb(badRequest('Only PDF files are allowed for resume upload.'), false);
};

// MediaRecorder output is audio/webm (Chrome/Firefox) or audio/mp4 (Safari);
// some browsers label audio-only containers as video/webm or video/mp4.
const AUDIO_TYPES = /^(audio\/|video\/(webm|mp4)|application\/(ogg|octet-stream))/;
const audioFilter = (req, file, cb) => {
  if (AUDIO_TYPES.test(file.mimetype || '')) cb(null, true);
  else cb(badRequest('Only audio files are allowed.'), false);
};

export const uploadResume = multer({
  storage,
  fileFilter: resumeFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('resume');

export const uploadAudio = multer({
  storage,
  fileFilter: audioFilter,
  limits: { fileSize: 25 * 1024 * 1024 },
}).single('audio');
