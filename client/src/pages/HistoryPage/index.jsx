import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getInterviewHistory,
  deleteInterview,
  clearInterviewHistory,
} from '../../services/historyService';
import formatDate from '../../utils/formatDate.js';
import './index.css';

function HistoryPage() {
  const navigate = useNavigate();

  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    try {
      setLoading(true);

      const data = await getInterviewHistory();

      setHistory(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load history:', error);
      toast.error('Failed to load interview history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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

  const handleClearHistory = async () => {
    if (history.length === 0) {
      toast.error('No interview history to clear.');
      return;
    }

    const confirmed = window.confirm(
      'Are you sure you want to clear all interview history?'
    );

    if (!confirmed) {
      return;
    }

    try {
      await clearInterviewHistory();

      setHistory([]);

      toast.success('Interview history cleared.');
    } catch (error) {
      console.error('Failed to clear history:', error);
      toast.error('Failed to clear interview history.');
    }
  };

  if (loading) {
    return (
      <div className="history-page">
        <div className="history-loading">
          Loading interview history...
        </div>
      </div>
    );
  }

  return (
    <div className="history-page">
      <div className="history-container">
        <div className="history-header">
          <div>
            <h1>Interview History</h1>
            <p>Review your previous AI mock interviews.</p>
          </div>

          {history.length > 0 && (
            <button
              className="history-clear-btn"
              onClick={handleClearHistory}
            >
              Clear History
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="history-empty">
            <h2>No interviews yet</h2>
            <p>
              Complete your first AI mock interview to see it here.
            </p>

            <button
              className="history-start-btn"
              onClick={() => navigate('/setup')}
            >
              Start Interview
            </button>
          </div>
        ) : (
          <div className="history-list">
            {history.map((interview) => {
              const score =
                interview.overallScore ??
                interview.score ??
                0;

              return (
                <div
                  className="history-card"
                  key={interview._id}
                >
                  <div className="history-card-info">
                    <h2>
                      {interview.role || 'Mock Interview'}
                    </h2>

                    <p>
                      Difficulty:{' '}
                      {interview.difficulty || 'Not specified'}
                    </p>

                    <p>
                      Date:{' '}
                      {formatDate(
                        interview.completedAt ||
                          interview.createdAt
                      )}
                    </p>
                  </div>

                  <div className="history-card-score">
                    <span>Score</span>
                    <strong>{score}</strong>
                  </div>

                  <div className="history-card-actions">
                    <button
                      className="history-view-btn"
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
                      className="history-delete-btn"
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
      </div>
    </div>
  );
}

export default HistoryPage;