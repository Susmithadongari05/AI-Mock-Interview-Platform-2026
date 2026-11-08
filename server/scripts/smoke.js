// End-to-end smoke test against a RUNNING server, using your real .env credentials.
//   1) In one terminal:  npm run dev
//   2) In another:       npm run smoke            (optional: SMOKE_API=http://localhost:5000/api)
// It registers a throw-away user (…@smoke-test.invalid), logs in, uploads a generated PDF resume,
// starts a 2-question interview (calls Gemini), answers by text, ends it (Gemini feedback),
// reads the feedback back, and finally deletes ONLY the interviews/resume/user it created.
// Optional: SMOKE_AUDIO=path\to\recording.webm also tests AssemblyAI transcription. SMOKE_TTS=1 tests Murf.
import fs from 'node:fs';
import mongoose from 'mongoose';
import '../src/config/env.js';

const API = process.env.SMOKE_API || `http://localhost:${process.env.PORT || 5000}/api`;
const email = `smoke-${Date.now()}@smoke-test.invalid`;
const password = 'Smoke-Test-123';
const results = [];
let token = '';
let interviewId = '';

const record = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
};

const call = async (method, path, body, extra = {}) => {
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra.headers };
  let payload = body;
  if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const response = await fetch(`${API}${path}`, { method, headers, body: payload });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
};

const step = async (name, fn) => {
  try { const detail = await fn(); record(name, true, detail); return true; }
  catch (error) { record(name, false, error.message); return false; }
};
const expect = (condition, message) => { if (!condition) throw new Error(message); };

// Builds a tiny valid single-page text PDF (no external tools needed).
const makePdf = (lines) => {
  const content = `BT /F1 12 Tf 50 750 Td 14 TL ${lines.map((l) => `(${l.replace(/[()\\]/g, '')}) Tj T*`).join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
};

console.log(`Smoke test against ${API}\n`);

if (!(await step('Server reachable (/health)', async () => {
  const r = await call('GET', '/health'); expect(r.status === 200, `HTTP ${r.status}`);
}))) { console.log('\nStart the server first: npm run dev'); process.exit(1); }

await step('Register', async () => {
  const r = await call('POST', '/auth/register', { name: 'Smoke Test', email, password });
  expect(r.status === 201 && r.json.data?.token, `HTTP ${r.status}: ${r.json.message}`); token = r.json.data.token;
});
await step('Reject duplicate registration (409)', async () => {
  const r = await call('POST', '/auth/register', { name: 'Smoke Test', email, password }); expect(r.status === 409, `HTTP ${r.status}`);
});
await step('Login with wrong password is rejected (401)', async () => {
  const r = await call('POST', '/auth/login', { email, password: 'wrong-password' }); expect(r.status === 401, `HTTP ${r.status}`);
});
await step('Login', async () => {
  const r = await call('POST', '/auth/login', { email: email.toUpperCase(), password });
  expect(r.status === 200 && r.json.data?.token, `HTTP ${r.status}: ${r.json.message}`); token = r.json.data.token;
});
await step('Protected route without token (401)', async () => {
  const saved = token; token = ''; const r = await call('GET', '/auth/me'); token = saved; expect(r.status === 401, `HTTP ${r.status}`);
});
await step('GET /auth/me', async () => {
  const r = await call('GET', '/auth/me'); expect(r.status === 200 && r.json.data?.email === email, `HTTP ${r.status}`);
});

let resumeText = '';
await step('Resume upload + PDF text extraction', async () => {
  const form = new FormData();
  form.append('resume', new Blob([makePdf(['Jane Developer - Full Stack Engineer', 'Skills: JavaScript, React, Node.js, Express, MongoDB', 'Experience: built REST APIs and React dashboards for 3 years'])], { type: 'application/pdf' }), 'resume.pdf');
  const r = await call('POST', '/resume/upload', form);
  expect(r.status === 200 && r.json.data?.text?.includes('React'), `HTTP ${r.status}: ${r.json.message}`); resumeText = r.json.data.text;
  return `${resumeText.length} characters extracted`;
});
await step('Resume retrieval', async () => {
  const r = await call('GET', '/resume'); expect(r.status === 200 && r.json.data?.text, `HTTP ${r.status}`);
});
await step('Non-PDF resume rejected (400)', async () => {
  const form = new FormData(); form.append('resume', new Blob(['hello'], { type: 'text/plain' }), 'x.txt');
  const r = await call('POST', '/resume/upload', form); expect(r.status === 400, `HTTP ${r.status}`);
});

const startOk = await step('Start interview (Gemini question generation)', async () => {
  const r = await call('POST', '/interview/start', { role: 'Full Stack Developer', difficulty: 'easy', resumeText, totalQuestions: 2 });
  expect(r.status === 201 && r.json.data?.interviewId, `HTTP ${r.status}: ${r.json.message}`);
  interviewId = r.json.data.interviewId; return `${r.json.data.questions.length} question(s)`;
});

if (startOk) {
  await step('Text answer 1 -> next question', async () => {
    const r = await call('POST', `/interview/${interviewId}/answer`, { answer: 'I would design a REST API with Express, validate input, and use MongoDB indexes.', questionIndex: 0 });
    expect(r.status === 200 && r.json.data?.saved, `HTTP ${r.status}: ${r.json.message}`);
  });
  await step('Duplicate submission of question 1 is rejected (409)', async () => {
    const r = await call('POST', `/interview/${interviewId}/answer`, { answer: 'again', questionIndex: 0 }); expect(r.status === 409, `HTTP ${r.status}`);
  });
  await step('Text answer 2 -> completed', async () => {
    const r = await call('POST', `/interview/${interviewId}/answer`, { answer: 'I use React state and effects, memoization where measured, and test components with Testing Library.', questionIndex: 1 });
    expect(r.status === 200 && r.json.data?.completed === true, `HTTP ${r.status}: ${r.json.message}`);
  });
  await step('End interview (Gemini feedback + score)', async () => {
    const r = await call('POST', `/interview/${interviewId}/end`);
    expect(r.status === 200 && Number.isFinite(r.json.data?.overallScore), `HTTP ${r.status}: ${r.json.message}`); return `score ${r.json.data.overallScore}`;
  });
  await step('Retrieve feedback', async () => {
    const r = await call('GET', `/interview/${interviewId}/feedback`);
    expect(r.status === 200 && r.json.data?.feedback?.categoryScores, `HTTP ${r.status}`);
  });
  await step('History lists the interview', async () => {
    const r = await call('GET', '/history'); expect(r.status === 200 && r.json.data.some((i) => i._id === interviewId), `HTTP ${r.status}`);
  });
  await step('Code submission + AI code review', async () => {
    const r2 = await call('POST', '/interview/start', { role: 'Backend Developer', difficulty: 'easy', resumeText, totalQuestions: 1 });
    expect(r2.status === 201, `start HTTP ${r2.status}: ${r2.json.message}`);
    const id = r2.json.data.interviewId;
    const r = await call('POST', `/interview/${id}/code`, { code: 'function sum(a, b) { return a + b; }', language: 'javascript', questionIndex: 0 });
    expect(r.status === 200 && r.json.data?.codeEvaluation, `HTTP ${r.status}: ${r.json.message}`);
    expect(r.json.data.codeEvaluation.status === 'reviewed', `AI review unavailable: ${r.json.data.codeEvaluation.error || r.json.data.codeEvaluation.note}`);
  });
}

if (process.env.SMOKE_AUDIO) {
  await step('AssemblyAI transcription', async () => {
    const form = new FormData(); form.append('audio', new Blob([fs.readFileSync(process.env.SMOKE_AUDIO)], { type: 'audio/webm' }), 'answer.webm');
    const r = await call('POST', '/interview/transcribe', form); expect(r.status === 200 && typeof r.json.data?.text === 'string', `HTTP ${r.status}: ${r.json.message}`);
    return `transcript: "${r.json.data.text.slice(0, 60)}"`;
  });
} else console.log('SKIP  AssemblyAI transcription (set SMOKE_AUDIO=<audio file> to test)');

if (process.env.SMOKE_TTS && interviewId) {
  await step('Murf text-to-speech', async () => {
    const r = await call('GET', `/interview/${interviewId}/question/0/speech`); expect(r.status === 200 && r.json.data?.audioUrl, `HTTP ${r.status}: ${r.json.message}`);
  });
} else console.log('SKIP  Murf text-to-speech (set SMOKE_TTS=1 to test)');

// Cleanup: remove ONLY what this run created (the throw-away user and its own data).
try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000, ...(process.env.MONGODB_DB_NAME ? { dbName: process.env.MONGODB_DB_NAME } : {}) });
  const db = mongoose.connection.db;
  const user = await db.collection('users').findOne({ email });
  if (user && email.endsWith('@smoke-test.invalid')) {
    await db.collection('interviews').deleteMany({ userId: user._id });
    await db.collection('resumes').deleteMany({ userId: user._id });
    await db.collection('users').deleteOne({ _id: user._id });
    console.log('\nCleaned up the throw-away smoke-test user and its data.');
  }
} catch (error) { console.log(`\nCleanup skipped (${error.message}); remove ${email} manually if needed.`); }
finally { await mongoose.disconnect().catch(() => {}); }

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed.`);
process.exit(failed ? 1 : 0);
