import * as interviewService from '../services/interview.service.js';

export const startInterviewController = async (req, res, next) => {
  try {
    // Do not log the request body: it contains the candidate's full resume text (personal data).
    const { role, difficulty, resumeText, totalQuestions } = req.body || {};

    const interview = await interviewService.startInterview(
      req.user._id,
      role,
      difficulty,
      resumeText,
      totalQuestions || 5
    );

    return res.status(201).json({
      success: true,
      data: interview,
    });
  } catch (error) {
    next(error);
  }
};

export const getInterviewController = async (req, res, next) => {
  try {
    const interview = await interviewService.getInterview(
      req.params.id,
      req.user._id
    );

    return res.json({
      success: true,
      data: interview,
    });
  } catch (error) {
    next(error);
  }
};

export const submitTextAnswer = async (req, res, next) => {
  try {
    const { answer, questionIndex } = req.body || {};

    const result = await interviewService.submitTextAnswer(
      req.params.id,
      req.user._id,
      answer,
      questionIndex
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const submitCodeAnswer = async (req, res, next) => {
  try {
    const { code, language, questionIndex } = req.body || {};

    const result = await interviewService.submitCodeAnswer(
      req.params.id,
      req.user._id,
      code,
      language,
      questionIndex
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const submitAudioAnswer = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No audio file uploaded.',
      });
    }

    const result = await interviewService.submitAudioAnswer(
      req.params.id,
      req.user._id,
      req.file,
      req.body?.questionIndex
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const endInterview = async (req, res, next) => {
  try {
    const result = await interviewService.endInterview(
      req.params.id,
      req.user._id
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getFeedbackController = async (req, res, next) => {
  try {
    const result = await interviewService.getFeedback(
      req.params.id,
      req.user._id
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const transcribeAudioController = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No audio file uploaded.',
      });
    }

    const result = await interviewService.transcribeAudioAnswer(req.file);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const speakQuestionController = async (req, res, next) => {
  try {
    const result = await interviewService.speakQuestion(
      req.params.id,
      req.user._id,
      req.params.index
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};