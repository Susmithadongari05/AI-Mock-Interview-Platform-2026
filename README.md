# AI Mock Interview Platform

React + Vite frontend, Node/Express + MongoDB backend, with Google Gemini (questions, code review, feedback),
AssemblyAI (voice transcription) and Murf (read-aloud) integrations.

```
client/   React 19 + Vite       (http://localhost:5173)
server/   Express 5 + Mongoose  (http://localhost:5000)
```

## 1. Setup on Windows / VS Code

Requirements: **Node.js 20.19+ or 22+** (`node -v`), a MongoDB database (Atlas or local), and your own API keys.

Open the project folder in VS Code, then open two terminals (Terminal > New Terminal).

**Terminal 1 – backend**
```powershell
cd server
npm install
copy .env.example .env
notepad .env            # fill in YOUR values (see section 2) and save
npm run check:env       # prints how the server is configured, without secrets
npm run dev
```

**Terminal 2 – frontend**
```powershell
cd client
npm install
npm run dev
```
Open the exact `Local:` URL Vite prints (normally http://localhost:5173).

Other commands: `npm test` (server unit tests), `npm run build` (client production build),
`npm run smoke` (server folder; full end-to-end test against the running server, see section 5).

## 2. Environment setup (`server/.env`)

`server/.env` is private. It is listed in `.gitignore` and is **not** part of this ZIP. Never commit or share it.
`server/.env.example` lists every variable with placeholders.

| Variable | Notes |
|---|---|
| `MONGODB_URI` | Atlas connection string. **Put the database name after the host** (`…mongodb.net/ai_mock_interview?…`). Without it MongoDB uses a database called `test`. URL-encode special characters in the password. |
| `MONGODB_DB_NAME` | Optional. Forces the database name regardless of the URI. |
| `JWT_SECRET` | 32+ random characters: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `GEMINI_API_KEY` | From https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | Default `gemini-3.8-flash`. Pick IDs only from https://ai.google.dev/gemini-api/docs/models |
| `ASSEMBLYAI_API_KEY` | Needed for voice answers. |
| `MURF_API_KEY`, `MURF_VOICE_ID` | Optional. Enables the "Listen to question" button. |
| `CLIENT_URL` | Allowed frontend origin(s), comma-separated. In development any localhost port is accepted. |

After editing `.env`, **stop the server (Ctrl+C) and start it again** – environment variables are read once at startup.

## 3. Troubleshooting

### "[Gemini] … model … no longer available" or the log still shows an old model
On start, the server now prints exactly which folder it runs from, which `.env` file it read, and where `GEMINI_MODEL` came from:
```
 Server folder : C:\...\server
 .env file     : C:\...\server\.env (found)
 Gemini model  : gemini-3.8-flash  [GEMINI_MODEL from env-file]
```
If the model shown is not what you set, check in this order:
1. **Wrong copy of the project.** Compare "Server folder" with the folder you edited (search your PC for other `geminiService.js` files). The ZIP you sent contained no `[Gemini] Using model:` log line and used different error wording than the logs you pasted, so the process that produced your error was not running the ZIP's code.
2. **Server not restarted** after editing `.env`.
3. **A stale OS variable** `GEMINI_MODEL` (Windows: *Edit environment variables for your account*, or `$env:GEMINI_MODEL` in PowerShell). Plain `dotenv` never overrides it; this loader lets `server/.env` win outside production and prints a NOTE when it happens. Remove the stale variable: `Remove-Item Env:GEMINI_MODEL`.
4. **Wrong working directory.** The old `import "dotenv/config"` read `.env` from wherever you launched the command. The new loader uses the absolute path of `server/.env`.
`npm run check:env` shows all of this without starting the server.

### Login/registration fails, or the password-reset script "cannot find the account"
MongoDB keeps users **per database**. The app and a script see different users if their connection strings differ in host (cluster) **or database name** – a URI without a database name silently uses `test`. The server logs `MongoDB connected: host=… database="…"` at start.
```powershell
cd server
npm run db:info                 # which host/database, which collections, masked user emails
npm run db:scan                 # also looks in every database on the cluster for a "users" collection
npm run user:reset-password -- you@example.com
```
`user:reset-password` uses the same configuration as the server, only **updates the password hash of one existing user**, never creates/deletes users, and if the email is missing it tells you which database it searched and whether the email exists in another database on the cluster. If the record is in a different database, put that database name into `MONGODB_URI` (or `MONGODB_DB_NAME`). If it is in a different Atlas cluster/project, `MONGODB_URI` points at the wrong cluster. Existing data is never deleted or overwritten.

### "Cannot reach the server"
Backend not running, or port mismatch. The frontend calls `/api` on the Vite dev server, which proxies to `http://localhost:5000` (`client/vite.config.js`). Check `http://localhost:5000/api/health`.

## 4. Features
Registration/login (bcrypt, JWT), protected routes, PDF resume upload + text extraction, interview setup (role, difficulty → 4/5/7 questions, resume), Gemini-generated questions, text / voice (MediaRecorder → AssemblyAI) / code answers with AI code review (by inspection – code is **not executed**), Gemini feedback with 5 category scores, history, and Murf read-aloud.

## 5. Verification
See `VERIFICATION.md` for what was and was not tested. To test everything with your own keys:
```powershell
cd server
npm run dev            # terminal 1
npm run smoke          # terminal 2   (optional: $env:SMOKE_AUDIO="C:\path\clip.webm"; $env:SMOKE_TTS="1")
```
The smoke test creates a throw-away `…@smoke-test.invalid` user, exercises register → login → resume → Gemini questions → answers → feedback → code review, then deletes only the data it created.

## 6. Deployment (not yet deployed – nothing here has been published)

**Backend** (any Node host: Render, Railway, Fly, a VPS): root `server/`, install `npm ci`, start `npm start`.
Set these in the host's environment settings (not in files): `NODE_ENV=production`, `MONGODB_URI` (with database name),
`JWT_SECRET` (32+ random chars), `GEMINI_API_KEY`, `GEMINI_MODEL`, `ASSEMBLYAI_API_KEY`, optional `MURF_API_KEY`/`MURF_VOICE_ID`,
`CLIENT_URL` = the exact deployed frontend origin (e.g. `https://app.example.com`, no trailing path), and `TRUST_PROXY=1` when the host is a reverse proxy.
In production CORS accepts only `CLIENT_URL`; unexpected 500 errors return a generic message. Health check: `GET /api/health`.
In MongoDB Atlas allow the host's outbound IPs under Network Access.

**Frontend** (Vercel, Netlify, Cloudflare Pages, any static host): root `client/`, build `npm run build`, publish `dist/`.
Build-time variable `VITE_API_URL=https://<backend-host>/api` (see `client/.env.production.example`; it is public, never put secrets in `VITE_*`).
Refreshing deep links such as `/history` needs an SPA fallback: `client/vercel.json` (Vercel) and `client/public/_redirects` (Netlify/Cloudflare) are included.
Login/register are rate-limited per IP (`AUTH_RATE_LIMIT_MAX`, default 30 per 15 minutes).
