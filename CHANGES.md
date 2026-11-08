# Changes: what was found, why, and every file touched

## Confirmed problems and root causes

| # | Problem | Root cause (evidence) | Fix |
|---|---|---|---|
| 1 | Gemini 404 "gemini-2.5-flash no longer available" and the model never changed after editing `.env` | **(a)** The code that printed your error is not the code in the ZIP: the ZIP had no `[Gemini] Using model:` log line and different error wording, so your running process came from another/older copy or an un-restarted server. **(b)** The ZIP's loader (`import "dotenv/config"`) reads `.env` from the *current working directory* and never overrides an existing OS/shell variable, so a different launch folder or a stale `GEMINI_MODEL` variable silently wins over the file. **(c)** The model default was `gemini-2.5-flash`. Google's docs say 2.5 models are limited to users who used them recently, which is exactly your 404. **(d)** It used the legacy `@google/generative-ai` SDK (support ended 2025-11-30) while the project already had the supported `@google/genai` installed but unused. | `config/env.js` loads `server/.env` by absolute path, lets the file win over stale shell variables outside production, and reports the source of each value. Startup prints folder, `.env` path, model + where it came from. Gemini service moved to `@google/genai`, default `gemini-3.8-flash` (listed as stable/GA 2026-09-02 in Google's docs), no silent fallback, real API error + hint returned. |
| 2 | Voice answers never worked | `InterviewPage` rendered `ConversationalMic` with a prop it does not accept (`onRecordingComplete`), so nothing was ever submitted; that component also only does browser speech-to-text, never AssemblyAI. | Page now uses `VoiceRecorder` (MediaRecorder → upload → AssemblyAI). Recorder keeps the browser's real MIME type (Safari records mp4, not webm). |
| 3 | Interview page unstyled | `InterviewPage/index.css` styled an older layout; none of the class names in the current JSX existed in it. | CSS rewritten to match the current markup. |
| 4 | Login "Network Error" risk | Hard-coded `http://localhost:5000/api` + CORS for exactly one origin: Vite moving to port 5174, or `127.0.0.1` vs `localhost`, are blocked. | Frontend uses `/api` through a Vite proxy (no CORS in dev); CORS accepts several origins and any localhost port outside production; clear "Cannot reach the server" message. |
| 5 | Users "not found" by reset script / different data seen | MongoDB data is per database; the URI had no enforced database name (driver default `test`) and nothing logged which one was used. Not provable from the ZIP alone (the reset script and `.env` were not included). | Server logs host + database and warns when the URI names none; `MONGODB_DB_NAME`; `db:info`, `db:scan`, `user:reset-password` scripts that use the server's own config and never delete. |
| 6 | Resume text logged | Controller logged the whole request body (full resume = personal data). | Removed. |
| 7 | Refresh mid-interview, double submits | Resume position computed from flags that did not match the stored data; no protection against the same answer being saved twice. | Position = number of saved answers; client sends `questionIndex`, server returns 409 on mismatch; retry button when only the feedback step failed. |
| 8 | Dashboard average score wrong | Unfinished interviews counted as score 0. | Only completed interviews counted; unfinished ones open the interview instead of an empty feedback page. |
| 9 | Upload errors reported as HTTP 500 | Multer filter errors had no status code. | Mapped to 400/413; JSON parse, Cast, Validation and duplicate-key errors also mapped. |
| 10 | Any DB hiccup during auth looked like "invalid token" | Auth middleware turned every error into 401. | Only JWT errors are 401. |
| 11 | Murf implemented but never reachable | No route/UI used it. | `GET /api/interview/:id/question/:index/speech` + "Listen to question" button. |
| 12 | Stale session handling | Any `/auth/me` failure (even offline) logged the user out; 401 on protected calls left the app in a broken state. | Only a real 401 clears the token and redirects to login. |

## Changed / new files

### Server
- `server.js` – loads env first; startup diagnostics; validates required settings.
- `src/config/env.js` **(new)** – absolute-path `.env` loader, source tracking, URI redaction.
- `src/config/db.config.js` – logs host/database, warns on missing DB name, `MONGODB_DB_NAME`, 10s timeout, actionable hints; throws instead of exiting.
- `src/config/cors.js` **(new)**, `src/app.js` – multi-origin CORS, `/api/health`.
- `src/services/geminiService.js` – `@google/genai`, `GEMINI_MODEL`, JSON mode, retries (429/5xx only), real errors + hints.
- `src/utils/aiJson.js` **(new)** – tolerant JSON parsing; feedback validation/clamping (nothing fabricated).
- `src/utils/questions.js` **(new)** – question normalisation / count clamp (extracted for testing).
- `src/services/interview.service.js` – saved-resume fallback, duplicate-submit protection, validated feedback, code-review failure reason stored, `speakQuestion`.
- `src/controllers/interview.controller.js`, `src/routes/interview.routes.js` – `questionIndex`, speech route, no resume logging.
- `src/services/murf.service.js` – 503 when unconfigured, timeout, voice via `MURF_VOICE_ID`.
- `src/services/resume.service.js` – Uint8Array for pdf.js, 422 with a helpful message for scanned PDFs.
- `src/services/assemblyai.service.js` – rejects empty audio.
- `src/middleware/error.middleware.js`, `upload.middleware.js`, `auth.middleware.js`, `src/utils/jwt.utils.js` – see table.
- `package.json`, `package-lock.json` – removed legacy `@google/generative-ai` (lockfile entry removed by hand), scripts added. No other dependency versions changed.
- `.env.example`, `.gitignore` – placeholders only; `.env*` ignored.
- `scripts/check-env.js`, `db-info.js`, `reset-password.js`, `smoke.js` **(new)**.
- `test/*.test.js` **(new)** – 18 unit tests (`npm test`).

### Client
- `vite.config.js` (dev proxy), `src/services/api.js` (base URL, timeout, 401 handling, `getErrorMessage`), `src/services/interviewService.js` (questionIndex, speech, no manual multipart header).
- `src/context/AuthContext.jsx`, `components/ProtectedRoute/index.jsx`, `pages/LoginPage/index.jsx`.
- `pages/InterviewPage/index.jsx` + `index.css`, `components/VoiceRecorder/index.jsx`.
- `pages/InterviewSetupPage/index.jsx` (question count from difficulty, real errors), `pages/HomePage/index.jsx`, `pages/HistoryPage/index.jsx`, `pages/FeedbackPage/index.jsx`.
- `client/.env.example`, `client/.gitignore` **(new)**.

### Root
- `README.md`, `CHANGES.md`, `VERIFICATION.md` **(new)**; `AUDIT-NOTES.md` removed (superseded; it contained unverified statements); `.gitignore`.

## Deliberately not changed
- `ConversationalMic` (browser speech-to-text) is kept but unused.
- Code answers are reviewed by AI **by inspection**; there is no sandbox that executes code.
- Dependency versions (see `VERIFICATION.md` > Remaining items).

---
# Second audit pass
| # | Finding | Fix |
|---|---|---|
| 13 | `npm test` (`node --test`) also executed `scripts/smoke-test.js` (name matches Node's test glob), which needs a live server, so the test command always failed. | Renamed to `scripts/smoke.js` (`npm run smoke` unchanged). |
| 14 | Express 5 leaves `req.body` undefined for non-JSON/empty requests; `auth.controller` destructured it and returned a 500 instead of a 400. Non-string email/password were not rejected up front. | `req.body ?? {}`; type checks return 400. |
| 15 | Two simultaneous submits of one answer could both be stored (read-then-save). | Atomic `findOneAndUpdate` with `answers.<n> $exists:false`; the code review is stored in the same atomic update. Loser gets 409. |
| 16 | Dates were shown as "25 October 2026" / "Oct 25, 2026" (en-US card). | One helper `client/src/utils/formatDate.js` -> `DD/MM/YYYY` everywhere. |
| 17 | A render crash produced a blank white page. | `components/ErrorBoundary` wraps the app. |
| 18 | Submitted transcripts were `console.log`ged in the browser. | Removed. |
| 19 | History list returned each interview's full resume text. | Excluded from the list response. |
| 20 | No brute-force protection on login/register; unexpected 500 messages could leak internals in production; no basic security headers. | `rateLimit.middleware.js`, production-only generic 500 message, `X-Powered-By` off + nosniff/frame/referrer headers, `TRUST_PROXY`. |
| 21 | Deep-link refresh would 404 on static hosts. | `client/vercel.json`, `client/public/_redirects`, `.env.production.example`, README section 6. |

---
# Theme pass: Emerald & Gold (CSS only; backend, auth, API and routing untouched)
Palette: #04120e main, #020a07 dark, #0b1f18 card surfaces, #10b981 / #34d399 / #059669 emerald, #d4af37 / #e6c35c / #f4d77a gold.
Cause of "colors did not change": the CSS in the delivered project was still the earlier blue/navy version (`#04120e` appeared in none of the stylesheets), so pasted changes never reached the folder Vite serves.
Files: `App.css`, `components/Navbar/index.css`, `pages/HomePage/index.css` (the dashboard), `pages/InterviewSetupPage/index.css`, `pages/InterviewPage/index.css`, `components/VoiceRecorder/index.css`, `components/CodeEditor/index.css` (+ Monaco theme `vs-dark` in `CodeEditor/index.jsx`), `components/ProtectedRoute/index.css`.

---
# Start Interview stuck on "Preparing Your Interview"
Cause: `askGemini` had no timeout. If Gemini was slow, overloaded (503) or unreachable, `POST /api/interview/start` never answered, so DevTools showed "pending, 0 bytes" and the Vite proxy and browser (120 s) kept waiting.
- `server/src/services/geminiService.js`: 30 s timeout per request (with a real abort), 75 s overall deadline, up to 4 attempts with exponential backoff on 503/429/5xx/timeouts, friendly messages (503 busy, 504 timeout, 429 quota), optional `GEMINI_FALLBACK_MODEL` used only after the main model stayed overloaded/slow. No questions are hardcoded.
- `server/src/middleware/timeout.middleware.js` (new) + `routes/interview.routes.js`: 90 s hard deadline on `/start`, `/:id/code`, `/:id/end` with a JSON 504.
- `server/src/services/interview.service.js`: keeps the friendly status/message; stage logging `[start] ...` (no resume text, no secrets).
- `server/server.js`: logs unhandled rejections/exceptions instead of dying silently.
- `client/vite.config.js`: proxy timeouts and a JSON error when the backend is unreachable.
- `client/src/services/interviewService.js`, `services/api.js`, `pages/InterviewSetupPage`: 100 s browser timeout, Cancel button, elapsed seconds, error stays on the page with the real reason.
- Tests: 9 new Gemini tests, 2 timeout-middleware tests.
