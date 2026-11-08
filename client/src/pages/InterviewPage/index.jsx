
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  getInterview,
  submitInterviewAnswer,
  submitInterviewCode,
  endInterview,
  getQuestionSpeech,
} from '../../services/interviewService';

import { getErrorMessage } from '../../services/api';

import CodeEditor from '../../components/CodeEditor';
import ConversationalMic from '../../components/ConversationalMic';
import AudioPlayer from '../../components/AudioPlayer';

import './index.css';

const InterviewPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [interview, setInterview] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const [answer, setAnswer] = useState('');
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [ending, setEnding] = useState(false);

  const [error, setError] = useState('');
  const [hasSubmittedCurrentQuestion, setHasSubmittedCurrentQuestion] =
    useState(false);

  const [needsFinish, setNeedsFinish] = useState(false);

  const [speechUrl, setSpeechUrl] = useState('');
  const [speechLoading, setSpeechLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadInterview = async () => {
      try {
        setLoading(true);
        setError('');

        const data = await getInterview(id);

        if (!mounted) return;

        setInterview(data);

        const questions = data?.questions || [];
        const answeredCount = data?.answers?.length || 0;

        if (data?.status === 'completed') {
          navigate(`/feedback/${id}`, { replace: true });
          return;
        }

        if (answeredCount >= questions.length && questions.length > 0) {
          setCurrentQuestionIndex(questions.length - 1);
          setNeedsFinish(true);
        } else {
          setCurrentQuestionIndex(answeredCount);
        }
      } catch (err) {
        if (mounted) {
          setError(getErrorMessage(err, 'Failed to load interview.'));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (id) loadInterview();

    return () => {
      mounted = false;
    };
  }, [id, navigate]);

  const questions = interview?.questions || [];
  const currentQuestion = questions[currentQuestionIndex];

  const totalQuestions =
    interview?.totalQuestions || questions.length || 5;

  const questionNumber = currentQuestionIndex + 1;
  const isLastQuestion = questionNumber >= totalQuestions;

  const isCodeQuestion =
    currentQuestion?.isCodeQuestion === true ||
    currentQuestion?.type === 'coding';

  // Reset all answer and speech state for each new question.
  useEffect(() => {
    setAnswer('');
    setCode('');
    setHasSubmittedCurrentQuestion(false);
    setError('');
    setSpeechUrl('');
  }, [currentQuestionIndex]);

  const handleListen = async () => {
    if (speechLoading) return;

    try {
      setSpeechLoading(true);
      setError('');

      const url = await getQuestionSpeech(id, currentQuestionIndex);
      setSpeechUrl(url);
    } catch (err) {
      setError(
        getErrorMessage(err, 'Could not generate question audio.')
      );
    } finally {
      setSpeechLoading(false);
    }
  };

  const handleEndInterview = async () => {
    if (ending) return;

    try {
      setEnding(true);
      setError('');

      await endInterview(id);
      navigate(`/feedback/${id}`, { replace: true });
    } catch (err) {
      setEnding(false);
      setNeedsFinish(true);
      setError(
        getErrorMessage(err, 'Failed to generate feedback.')
      );
    }
  };

  const processAnswerResult = async (result) => {
    if (result?.completed) {
      await handleEndInterview();
      return;
    }

    if (result?.question) {
      setCurrentQuestionIndex((previous) => previous + 1);
      return;
    }

    setError('The next question could not be loaded.');
  };

  const handleSubmitAnswer = async () => {
    if (submitting || hasSubmittedCurrentQuestion) return;

    if (!answer.trim()) {
      setError('Please enter or speak your answer first.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setHasSubmittedCurrentQuestion(true);

      const result = await submitInterviewAnswer(
        id,
        answer.trim(),
        currentQuestionIndex
      );

      await processAnswerResult(result);
    } catch (err) {
      setHasSubmittedCurrentQuestion(false);
      setError(
        getErrorMessage(err, 'Failed to submit your answer.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitCode = async () => {
    if (submitting || hasSubmittedCurrentQuestion) return;

    if (!code.trim()) {
      setError('Please write your code first.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setHasSubmittedCurrentQuestion(true);

      const result = await submitInterviewCode(
        id,
        code,
        language,
        currentQuestionIndex
      );

      await processAnswerResult(result);
    } catch (err) {
      setHasSubmittedCurrentQuestion(false);
      setError(
        getErrorMessage(err, 'Failed to submit your code.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="interview-page">
        <div className="interview-loading">
          <h2>Loading interview...</h2>
          <p>Please wait.</p>
        </div>
      </div>
    );
  }

  if (!interview || !currentQuestion) {
    return (
      <div className="interview-page">
        <div className="interview-error">
          <h2>Unable to load interview</h2>
          {error && <p>{error}</p>}
          <button type="button" onClick={() => navigate('/setup')}>
            Back to Setup
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="interview-page">
      <div className="interview-container">

        <div className="interview-header">
          <div>
            <h1>AI Mock Interview</h1>
            <p>
              {interview.role || 'Software Engineer'}
              {' • '}
              {interview.difficulty || 'Medium'}
            </p>
          </div>

          <div className="question-counter">
            Question {questionNumber} of {totalQuestions}
          </div>
        </div>

        <div className="progress-container">
          <div
            className="progress-bar"
            style={{
              width: `${Math.min(
                (questionNumber / totalQuestions) * 100,
                100
              )}%`,
            }}
          />
        </div>

        {error && (
          <div className="interview-error-message">{error}</div>
        )}

        <div className="question-card">
          <div className="question-label">
            Question {questionNumber}
          </div>

          <h2 className="question-text">
            {currentQuestion.text ||
              currentQuestion.question ||
              'Interview Question'}
          </h2>

          <div className="question-listen">
            <button
              type="button"
              className="listen-button"
              onClick={handleListen}
              disabled={speechLoading || submitting || ending}
            >
              {speechLoading ? 'Generating audio...' : 'Listen to question'}
            </button>

            {speechUrl && <AudioPlayer src={speechUrl} autoPlay />}
          </div>

          {needsFinish && !ending && (
            <div className="interview-error-message">
              <p>All answers are saved. Please retry feedback generation.</p>
              <button
                type="button"
                className="submit-answer-button"
                onClick={handleEndInterview}
              >
                Retry generating feedback
              </button>
            </div>
          )}

          {!isCodeQuestion && (
            <>
              <textarea
                className="answer-input"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Type your answer here, or speak below..."
                disabled={
                  submitting ||
                  ending ||
                  needsFinish ||
                  hasSubmittedCurrentQuestion
                }
                rows={8}
              />

              <div className="voice-section">
                <div className="voice-divider">
                  <span>OR SPEAK YOUR ANSWER</span>
                </div>

                <ConversationalMic
                  key={`${id}-${currentQuestionIndex}`}
                  onTranscriptReady={setAnswer}
                  disabled={
                    submitting ||
                    ending ||
                    needsFinish ||
                    hasSubmittedCurrentQuestion
                  }
                />
              </div>

              <div className="answer-actions">
                <button
                  type="button"
                  className="submit-answer-button"
                  onClick={handleSubmitAnswer}
                  disabled={
                    submitting ||
                    ending ||
                    needsFinish ||
                    hasSubmittedCurrentQuestion
                  }
                >
                  {submitting
                    ? 'Processing...'
                    : isLastQuestion
                    ? 'Submit & Finish'
                    : 'Submit Answer'}
                </button>
              </div>
            </>
          )}

          {isCodeQuestion && (
            <div className="coding-section">
              <div className="language-selector">
                <label htmlFor="language">Language</label>

                <select
                  id="language"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  disabled={submitting || ending || hasSubmittedCurrentQuestion}
                >
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                  <option value="java">Java</option>
                  <option value="cpp">C++</option>
                </select>
              </div>

              <CodeEditor
                value={code}
                onChange={setCode}
                language={language}
                readOnly={submitting || ending || hasSubmittedCurrentQuestion}
              />

              <button
                type="button"
                className="submit-answer-button"
                onClick={handleSubmitCode}
                disabled={
                  submitting ||
                  ending ||
                  needsFinish ||
                  hasSubmittedCurrentQuestion
                }
              >
                {submitting
                  ? 'Evaluating...'
                  : isLastQuestion
                  ? 'Submit Code & Finish'
                  : 'Submit Code'}
              </button>
            </div>
          )}
        </div>

        {(submitting || ending) && (
          <div className="interview-processing">
            <div className="processing-spinner" />
            <h3>{ending ? 'Wrapping up...' : 'Processing your answer...'}</h3>
            <p>Please wait.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default InterviewPage;
