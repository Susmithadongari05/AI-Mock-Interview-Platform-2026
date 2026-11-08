import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getInterviewHistory,
  deleteInterview,
} from '../../services/historyService';
import formatDate from '../../utils/formatDate.js';
import './index.css';

function HomePage() {
  const navigate = useNavigate();

  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const data = await getInterviewHistory();

        setHistory(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Failed to load history:', error);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, []);

  const handleDelete = async (interviewId) => {
    try {
      await deleteInterview(interviewId);

      setHistory((previousHistory) =>
        previousHistory.filter((item) => item._id !== interviewId)
      );

      toast.success('Interview deleted.');
    } catch (error) {
      console.error('Failed to delete interview:', error);
      toast.error('Failed to delete interview.');
    }
  };

  // Only finished interviews have a score; unfinished ones must not count as 0.
  const completedList = history.filter(
    (interview) => interview.status === 'completed'
  );

  const completedInterviews = completedList.length;

  const averageScore =
    completedInterviews > 0
      ? Math.round(
          completedList.reduce(
            (total, interview) =>
              total +
              (interview.overallScore ??
                interview.score ??
                0),
            0
          ) / completedInterviews
        )
      : 0;

  return (
    <div className="home-page">
      <div className="home-container">
        <section className="home-hero">
          <div className="home-hero-content">
            <h1>AI Mock Interview Platform</h1>

            <p>
              Practice real interview questions, improve your
              communication, and get AI-powered feedback.
            </p>

            <button
              className="home-start-btn"
              onClick={() => navigate('/setup')}
            >
              Start Mock Interview
            </button>
          </div>
        </section>

        <section className="home-stats">
          <div className="home-stat-card">
            <span className="home-stat-number">
              {completedInterviews}
            </span>
            <span className="home-stat-label">
              Interviews Completed
            </span>
          </div>

          <div className="home-stat-card">
            <span className="home-stat-number">
              {averageScore}
            </span>
            <span className="home-stat-label">
              Average Score
            </span>
          </div>
        </section>

        <section className="home-history">
          <div className="home-section-header">
            <div>
              <h2>Recent Interviews</h2>
              <p>Your latest mock interview attempts.</p>
            </div>

            {history.length > 0 && (
              <button
                className="home-view-all-btn"
                onClick={() => navigate('/history')}
              >
                View All
              </button>
            )}
          </div>

          {loading ? (
            <div className="home-loading">
              Loading your interviews...
            </div>
          ) : history.length === 0 ? (
            <div className="home-empty">
              <h3>No interviews completed yet</h3>

              <p>
                Start your first mock interview and begin
                improving your interview skills.
              </p>

              <button
                className="home-empty-btn"
                onClick={() => navigate('/setup')}
              >
                Start Your First Interview
              </button>
            </div>
          ) : (
            <div className="home-history-list">
              {history.slice(0, 5).map((interview) => {
                const score =
                  interview.status === 'completed'
                    ? interview.overallScore ??
                      interview.score ??
                      0
                    : 'In progress';

                return (
                  <div
                    className="home-history-card"
                    key={interview._id}
                  >
                    <div className="home-history-info">
                      <h3>
                        {interview.role || 'Mock Interview'}
                      </h3>

                      <p>
                        {interview.difficulty ||
                          'Not specified'}
                      </p>

                      <span>
                        {formatDate(
                          interview.completedAt ||
                            interview.createdAt
                        )}
                      </span>
                    </div>

                    <div className="home-history-score">
                      <span>Score</span>
                      <strong>{score}</strong>
                    </div>

                    <div className="home-history-actions">
                      <button
                        className="home-view-btn"
                        onClick={() =>
                          navigate(
                            interview.status === 'completed'
                              ? `/feedback/${interview._id}`
                              : `/interview/${interview._id}`
                          )
                        }
                      >
                        View
                      </button>

                      <button
                        className="home-delete-btn"
                        onClick={() =>
                          handleDelete(interview._id)
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default HomePage;