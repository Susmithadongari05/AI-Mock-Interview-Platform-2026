import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  uploadResume,
  getResume,
  startInterview,
} from '../../services/interviewService.js';

import INTERVIEW_ROLES from '../../constants/roles.js';
import DIFFICULTY_LEVELS from '../../constants/difficulty.js';

import {
  BsDisplay,
  BsServer,
  BsLightningFill,
  BsGraphUp,
  BsCloudFill,
  BsStarFill,
  BsStar,
  BsFileEarmarkArrowUp,
  BsCheckCircleFill,
} from 'react-icons/bs';

import { FaPython, FaReact, FaJava } from 'react-icons/fa';

import toast from 'react-hot-toast';
import { getErrorMessage } from '../../services/api.js';

import './index.css';

const ROLE_ICONS = {
  'frontend-developer': BsDisplay,
  'backend-developer': BsServer,
  'full-stack-developer': BsLightningFill,
  'data-analyst': BsGraphUp,
  'devops-engineer': BsCloudFill,
  'python-developer': FaPython,
  'react-developer': FaReact,
  'java-developer': FaJava,
};

const DIFFICULTY_ICONS = {
  easy: (
    <span className="setup-difficulty-stars">
      <BsStarFill className="setup-star-filled" />
      <BsStar className="setup-star-empty" />
      <BsStar className="setup-star-empty" />
    </span>
  ),
  medium: (
    <span className="setup-difficulty-stars">
      <BsStarFill className="setup-star-filled" />
      <BsStarFill className="setup-star-filled" />
      <BsStar className="setup-star-empty" />
    </span>
  ),
  hard: (
    <span className="setup-difficulty-stars">
      <BsStarFill className="setup-star-filled" />
      <BsStarFill className="setup-star-filled" />
      <BsStarFill className="setup-star-filled" />
    </span>
  ),
};

function InterviewSetupPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('medium');

  const [resumeText, setResumeText] = useState('');
  const [resumeFileName, setResumeFileName] = useState('');

  const [loading, setLoading] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);

  // Start-interview progress: the request can be cancelled, shows how long it has been running,
  // and any failure stays visible on the page (a toast alone disappears too quickly).
  const [startError, setStartError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!loading) {
      setElapsed(0);
      return undefined;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [loading]);

  // Leaving the page cancels a request that is still running.
  useEffect(() => () => abortRef.current?.abort(), []);

  const handleCancelStart = () => {
    abortRef.current?.abort();
  };

  useEffect(() => {
    const loadSavedResume = async () => {
      try {
        const savedResume = await getResume();

        if (savedResume) {
          setResumeText(savedResume.text || '');
          setResumeFileName(savedResume.fileName || '');
        }
      } catch (error) {
        // No saved resume is okay.
      }
    };

    loadSavedResume();
  }, []);

  const handleResumeUpload = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.type !== 'application/pdf') {
      toast.error('Please upload a PDF resume.');
      return;
    }

    try {
      setUploadingResume(true);

      const result = await uploadResume(file);

      setResumeText(result.text || '');
      setResumeFileName(result.fileName || file.name);

      toast.success('Resume uploaded successfully.');
    } catch (error) {
      console.error('Resume upload error:', error);

      toast.error(
        getErrorMessage(error, 'Failed to upload resume. Please try again.')
      );
    } finally {
      setUploadingResume(false);
    }
  };

  const handleNext = () => {
    if (step === 1) {
      if (!selectedRole) {
        toast.error('Please select an interview role.');
        return;
      }

      setStep(2);
      return;
    }

    if (step === 2) {
      if (!selectedDifficulty) {
        toast.error('Please select a difficulty level.');
        return;
      }

      setStep(3);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((previousStep) => previousStep - 1);
    }
  };

  const handleStartInterview = async () => {
    if (!selectedRole) {
      toast.error('Please select an interview role.');
      return;
    }

    if (!selectedDifficulty) {
      toast.error('Please select a difficulty level.');
      return;
    }

    if (!resumeText) {
      toast.error('Please upload your resume.');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setStartError('');
      setLoading(true);

      // Question count comes from the chosen difficulty (4 / 5 / 7).
      const level = DIFFICULTY_LEVELS.find(
        (item) => item.id === selectedDifficulty
      );

      const result = await startInterview(
        selectedRole,
        selectedDifficulty,
        resumeText,
        level?.questions || 5,
        { signal: controller.signal }
      );

      if (!result?.interviewId) {
        throw new Error('Interview ID was not returned by the server.');
      }

      navigate(`/interview/${result.interviewId}`);
    } catch (error) {
      if (controller.signal.aborted && !error?.response) {
        setStartError('You cancelled the request. Press Start Interview to try again.');
      } else {
        console.error('Start interview error:', error);
        const message = getErrorMessage(error, 'Failed to start interview. Please try again.');
        setStartError(message);
        toast.error(message, { duration: 8000 });
      }
      setLoading(false);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  if (loading) {
    return (
      <div className="setup-page">
        <div className="setup-preparing">
          <div
            className="spinner-border setup-preparing-spinner"
            role="status"
          >
            <span className="visually-hidden">Loading...</span>
          </div>

          <h2 className="setup-preparing-heading">
            Preparing Your Interview...
          </h2>

          <p className="setup-preparing-text">
            AI is analyzing your resume and generating personalized questions
            for the <strong>{selectedRole}</strong> role.
          </p>

          <div className="setup-preparing-steps">
            <div className="setup-prep-step">
              <BsCheckCircleFill className="setup-prep-step-icon-active" />
              <span className="setup-prep-step-text">
                Analyzing resume
              </span>
            </div>

            <div className="setup-prep-step">
              <BsCheckCircleFill className="setup-prep-step-icon-active" />
              <span className="setup-prep-step-text">
                Generating questions
              </span>
            </div>

            <div className="setup-prep-step">
              <BsCheckCircleFill className="setup-prep-step-icon-pending" />
              <span className="setup-prep-step-text">
                Setting up voice interviewer
              </span>
            </div>
          </div>

          <p className="setup-preparing-hint">
            {elapsed < 30
              ? `This may take 10-15 seconds... (${elapsed}s)`
              : `Taking longer than usual (${elapsed}s). The AI service may be busy; this will stop automatically if it does not answer.`}
          </p>

          <button
            type="button"
            className="setup-back-btn"
            onClick={handleCancelStart}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-page">
      <div className="setup-container">

        <div className="setup-step-indicator">
          <span
            className={`setup-step-badge ${
              step >= 1 ? 'setup-step-active' : ''
            }`}
          >
            1. Role
          </span>

          <span
            className={`setup-step-badge ${
              step >= 2 ? 'setup-step-active' : ''
            }`}
          >
            2. Difficulty
          </span>

          <span
            className={`setup-step-badge ${
              step >= 3 ? 'setup-step-active' : ''
            }`}
          >
            3. Resume
          </span>
        </div>

        {step === 1 && (
          <div className="setup-section">
            <h2 className="setup-section-heading">
              Select Interview Role
            </h2>

            <div className="setup-roles-grid">
              {INTERVIEW_ROLES.map((role) => {
                const RoleIcon = ROLE_ICONS[role.id];

                return (
                  <button
                    key={role.id}
                    className={`setup-role-card ${
                      selectedRole === role.title
                        ? 'setup-role-selected'
                        : ''
                    }`}
                    onClick={() => setSelectedRole(role.title)}
                  >
                    {RoleIcon && (
                      <RoleIcon className="setup-role-icon" />
                    )}

                    <h3 className="setup-role-title">
                      {role.title}
                    </h3>

                    <p className="setup-role-desc">
                      {role.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="setup-section">
            <h2 className="setup-section-heading">
              Choose Difficulty
            </h2>

            <div className="setup-difficulty-row">
              {DIFFICULTY_LEVELS.map((level) => (
                <button
                  key={level.id}
                  className={`setup-difficulty-card ${
                    selectedDifficulty === level.id
                      ? 'setup-difficulty-selected'
                      : ''
                  }`}
                  onClick={() =>
                    setSelectedDifficulty(level.id)
                  }
                >
                  {DIFFICULTY_ICONS[level.id]}

                  <h3 className="setup-difficulty-label">
                    {level.label}
                  </h3>

                  <p className="setup-difficulty-desc">
                    {level.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="setup-section">
            <h2 className="setup-section-heading">
              Upload Your Resume
            </h2>

            <div className="setup-resume-area">
              {resumeText ? (
                <div className="setup-resume-uploaded">
                  <div className="setup-resume-info">
                    <BsFileEarmarkArrowUp className="setup-resume-file-icon" />

                    <p className="setup-resume-name">
                      {resumeFileName}
                    </p>
                  </div>

                  <label className="setup-change-resume-btn">
                    Change

                    <input
                      type="file"
                      accept=".pdf"
                      onChange={handleResumeUpload}
                      disabled={uploadingResume}
                      hidden
                    />
                  </label>
                </div>
              ) : (
                <label className="setup-upload-zone">
                  <BsFileEarmarkArrowUp className="setup-upload-icon" />

                  <p className="setup-upload-text">
                    {uploadingResume
                      ? 'Uploading...'
                      : 'Click to upload PDF resume'}
                  </p>

                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleResumeUpload}
                    disabled={uploadingResume}
                    hidden
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {startError && (
          <div className="setup-error" role="alert">
            {startError}
          </div>
        )}

        <div className="setup-nav-buttons">
          {step > 1 && (
            <button
              className="setup-back-btn"
              onClick={handleBack}
            >
              Back
            </button>
          )}

          {step < 3 ? (
            <button
              className="setup-next-btn"
              onClick={handleNext}
            >
              Next
            </button>
          ) : (
            <button
              className={`setup-start-btn ${
                loading || !selectedRole || !resumeText
                  ? 'setup-start-btn-disabled'
                  : ''
              }`}
              onClick={handleStartInterview}
              disabled={
                loading ||
                !selectedRole ||
                !resumeText ||
                uploadingResume
              }
            >
              Start Interview
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

export default InterviewSetupPage;