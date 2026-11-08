import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema({
  type: { type: String, enum: ['text', 'code', 'audio'], required: true },
  answer: { type: String, default: '' },
  language: { type: String, default: '' },
}, { _id: true, timestamps: true });

const codeSubmissionSchema = new mongoose.Schema({
  code: { type: String, required: true },
  language: { type: String, default: 'unspecified' },
  evaluation: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

const interviewSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, required: true },
  difficulty: { type: String, required: true },
  resumeText: { type: String, required: true },
  totalQuestions: { type: Number, default: 5 },
  questions: { type: [mongoose.Schema.Types.Mixed], default: [] },
  answers: { type: [answerSchema], default: [] },
  codeSubmissions: { type: [codeSubmissionSchema], default: [] },
  status: { type: String, enum: ['in-progress', 'completed'], default: 'in-progress' },
  score: { type: Number, default: 0 },
  overallScore: { type: Number, default: null },
  feedback: { type: mongoose.Schema.Types.Mixed, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.models.Interview || mongoose.model('Interview', interviewSchema);
