import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getInterview } from '../../services/interviewService.js';
import { getErrorMessage } from '../../services/api.js';
import formatDate from '../../utils/formatDate.js';
import './index.css';

const CATEGORY_LABELS = {
  communicationSkills: 'Communication',
  technicalKnowledge: 'Technical Knowledge',
  problemSolving: 'Problem Solving',
  codeQuality: 'Code Quality',
  confidence: 'Confidence',
};

const asList = value => Array.isArray(value) ? value.filter(Boolean) : [];
const readable = value => String(value || '').replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase());

function FeedbackPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [interview, setInterview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const loadInterview = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await getInterview(id);
        if (active && data?.status !== 'completed') {
          // Not finished yet: there is no feedback to show, so continue the interview.
          navigate(`/interview/${id}`, { replace: true });
          return;
        }
        if (active) setInterview(data);
      } catch (err) {
        if (active) {
          setError(getErrorMessage(err, 'Failed to load interview feedback.'));
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    if (id) loadInterview();
    return () => { active = false; };
  }, [id]);

  const rawFeedback = interview?.feedback;
  const feedback = rawFeedback && typeof rawFeedback === 'object'
    ? rawFeedback
    : {};
  const categories = useMemo(() => {
    const scores = feedback.categoryScores && typeof feedback.categoryScores === 'object'
      ? feedback.categoryScores : {};
    return Object.entries(scores).map(([key, value]) => ({
      key,
      label: CATEGORY_LABELS[key] || readable(key),
      score: Math.max(0, Math.min(100, Number(value?.score) || 0)),
      comment: typeof value?.comment === 'string' ? value.comment : '',
    }));
  }, [feedback.categoryScores]);
  const overallScore = Math.max(0, Math.min(100, Number(
    interview?.overallScore ?? feedback.overallScore ?? interview?.score ?? 0
  ) || 0));

  if (loading) {
    return <div className="feedback-loading-state"><div className="feedback-spinner" /><p>Preparing your interview feedback...</p></div>;
  }
  if (error) {
    return <div className="feedback-loading-state"><h2>Unable to load feedback</h2><p>{error}</p><button className="feedback-btn-primary" onClick={() => navigate('/')}>Back to Dashboard</button></div>;
  }
  if (!interview) {
    return <div className="feedback-loading-state"><h2>Interview not found</h2><button className="feedback-btn-primary" onClick={() => navigate('/')}>Back to Dashboard</button></div>;
  }

  const strengths = asList(feedback.strengths);
  const improvements = asList(feedback.areasOfImprovement || feedback.areasForImprovement);
  const assessment = typeof rawFeedback === 'string'
    ? rawFeedback
    : feedback.finalAssessment || feedback.summary || 'Your interview has been saved. Complete an interview with answers to generate detailed AI feedback.';

  return (
    <main className="feedback-page">
      <div className="feedback-container">
        <header className="feedback-header">
          <p className="feedback-eyebrow">YOUR PERFORMANCE REPORT</p>
          <h1 className="feedback-heading">Interview Feedback</h1>
          <p className="feedback-role-text">{interview.role || 'Technical Interview'}</p>
          <p className="feedback-date-text">{formatDate(interview.completedAt || interview.createdAt, 'Completed interview')}</p>
        </header>

        <section className="feedback-score-panel">
          <div className="feedback-score-circle" aria-label={`Overall score ${overallScore} out of 100`}>
            <span className="feedback-score-number">{overallScore}</span>
            <span className="feedback-score-label">OUT OF 100</span>
          </div>
          <div className="feedback-score-summary">
            <span className="feedback-status-pill">{interview.status === 'completed' ? 'Interview completed' : 'Interview report'}</span>
            <h2>Overall Performance</h2>
            <p>{overallScore >= 80 ? 'Strong performance. Keep refining your interview skills.' : overallScore >= 60 ? 'Good foundation. Focus on the improvement areas below.' : 'Use this report as a focused plan for your next practice session.'}</p>
          </div>
        </section>

        <section className="feedback-section">
          <div className="feedback-section-title"><span>01</span><div><h2>Performance Breakdown</h2><p>Your scores across the core interview skills.</p></div></div>
          {categories.length ? <div className="feedback-category-grid">
            {categories.map(category => <article className="feedback-category-card" key={category.key}>
              <div className="feedback-category-top"><h3>{category.label}</h3><strong>{category.score}<small>/100</small></strong></div>
              <div className="feedback-progress-track"><div className="feedback-progress-fill" style={{ width: `${category.score}%` }} /></div>
              {category.comment && <p>{category.comment}</p>}
            </article>)}
          </div> : <p className="feedback-empty-note">Detailed category scores are not available for this interview.</p>}
        </section>

        <section className="feedback-callout feedback-callout-blue">
          <div className="feedback-section-title"><span>02</span><div><h2>Final Assessment</h2><p>The interviewer's overall evaluation.</p></div></div>
          <p className="feedback-assessment-text">{assessment}</p>
        </section>

        <div className="feedback-insights-grid">
          <section className="feedback-callout feedback-callout-success">
            <div className="feedback-section-title"><span>03</span><div><h2>What Went Well</h2><p>Strengths to keep building on.</p></div></div>
            {strengths.length ? <ul className="feedback-callout-list">{strengths.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p className="feedback-empty-note">No specific strengths were returned.</p>}
          </section>
          <section className="feedback-callout feedback-callout-warning">
            <div className="feedback-section-title"><span>04</span><div><h2>Areas to Improve</h2><p>Turn these into your next practice goals.</p></div></div>
            {improvements.length ? <ul className="feedback-callout-list">{improvements.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p className="feedback-empty-note">No specific improvement areas were returned.</p>}
          </section>
        </div>

        <footer className="feedback-actions-row">
          <button className="feedback-btn-primary" onClick={() => navigate('/setup')}>Practice Again</button>
          <button className="feedback-btn-outline" onClick={() => navigate('/history')}>View History</button>
          <button className="feedback-btn-outline" onClick={() => navigate('/')}>Dashboard</button>
        </footer>
      </div>
    </main>
  );
}

export default FeedbackPage;
