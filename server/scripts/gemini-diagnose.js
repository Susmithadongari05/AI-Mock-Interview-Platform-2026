// ============================================
// geminiService.js - Google Gemini access
// ============================================
// The model comes ONLY from the GEMINI_MODEL environment variable (see
// config/env.js for how .env is loaded). The default is `gemini-3.8-flash`.
// There is deliberately NO silent fallback to another model: if the configured
// model is rejected, the real API error is surfaced together with a hint.
// ============================================

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const OVERLOADED_STATUSES = new Set([429, 503]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const getGeminiModel = (env = process.env) =>
  String(env.GEMINI_MODEL || '').trim() || DEFAULT_GEMINI_MODEL;

// The SDK is loaded lazily, and the client factory is replaceable, so unit tests run
// without network access or the SDK installed.
const defaultFactory = async (apiKey) => {
  const { GoogleGenAI } = await import('@google/genai');
  return new GoogleGenAI({ apiKey });
};
let clientFactory = defaultFactory;
export const __setGeminiClientFactory = (factory) => {
  clientFactory = factory || defaultFactory;
};

const errorStatus = (error) =>
  Number(error?.status ?? error?.statusCode ?? error?.code ?? error?.response?.status) || undefined;

const hintFor = (status, message, modelName) => {
  if (status === 404 || /no longer available|not found|not supported for generateContent/i.test(message)) {
    return ` The model "${modelName}" was rejected by the API. Set GEMINI_MODEL in server/.env to a model listed at https://ai.google.dev/gemini-api/docs/models (current default: ${DEFAULT_GEMINI_MODEL}) and restart the server.`;
  }
  if (status === 400 && /api key/i.test(message)) return ' The API key looks invalid. Check GEMINI_API_KEY.';
  if (status === 401 || status === 403) return ' The API key was rejected or lacks access. Check GEMINI_API_KEY and that the Gemini API is enabled for it.';
  if (status === 429) return ' Rate limit or quota reached. Wait a moment or check your Gemini API quota.';
  return '';
};

// ---- Timeouts (all in milliseconds, all overridable from server/.env) ----
//   GEMINI_TIMEOUT_MS   one request to Gemini               (default 30000)
//   GEMINI_DEADLINE_MS  everything: retries + backoff       (default 75000)
//   GEMINI_MAX_ATTEMPTS how many tries per model            (default 4)
//   GEMINI_RETRY_BASE_MS first retry wait, doubles each time (default 1000)
//   GEMINI_FALLBACK_MODEL  optional second model, used ONLY after the main model stayed
//                          overloaded (503/429) or timed out. Empty = no fallback.
const num = (value, fallback) => (Number(value) > 0 ? Number(value) : fallback);

class GeminiTimeoutError extends Error {
  constructor(ms) {
    super(`Gemini did not respond within ${Math.round(ms / 1000)} seconds`);
    this.name = 'GeminiTimeoutError';
    this.isTimeout = true;
  }
}

// Reject if the request does not finish in `ms`. The AbortSignal also cancels the real HTTP request.
const callWithTimeout = (start, ms) => new Promise((resolve, reject) => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
    reject(new GeminiTimeoutError(ms));
  }, ms);
  start(controller.signal).then(
    (value) => { clearTimeout(timer); resolve(value); },
    (error) => { clearTimeout(timer); reject(error); },
  );
});

const backoff = (attempt, baseMs) => baseMs * 2 ** attempt + Math.floor(Math.random() * baseMs * 0.25);

const isOverload = (error) => OVERLOADED_STATUSES.has(errorStatus(error)) || /overloaded|unavailable|high demand/i.test(error?.message || '');
const isTransient = (error) => error?.isTimeout || RETRYABLE_STATUSES.has(errorStatus(error)) || isOverload(error);

// Reads the text out of an Interactions API response (`output_text`, or the model_output steps).
const textFromInteraction = (interaction) => {
  if (typeof interaction?.output_text === 'string' && interaction.output_text) return interaction.output_text;
  const steps = Array.isArray(interaction?.steps) ? interaction.steps : [];
  return steps
    .filter((step) => step?.type === 'model_output')
    .flatMap((step) => (Array.isArray(step.content) ? step.content : []))
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
};

// Direct REST call to generateContent using Node's built-in fetch (no SDK). Used when the SDK itself
// fails before any HTTP answer arrives. Real HTTP errors keep their status so they are reported correctly.
const restGenerateContent = async (modelName, text, config, signal) => {
  const body = { contents: [{ role: 'user', parts: [{ text }] }], generationConfig: {} };
  if (config.responseMimeType) body.generationConfig.responseMimeType = config.responseMimeType;
  if (config.temperature !== undefined) body.generationConfig.temperature = config.temperature;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal,
    },
  );
  const raw = await response.text();
  if (!response.ok) {
    let message = raw;
    try { message = JSON.parse(raw)?.error?.message || raw; } catch { /* keep raw text */ }
    throw Object.assign(new Error(message), { status: response.status });
  }
  const data = JSON.parse(raw);
  const output = (data?.candidates?.[0]?.content?.parts || []).map((part) => part?.text || '').join('');
  if (!output.trim()) {
    const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
    throw new Error(`Gemini returned an empty response${reason ? ` (finish reason: ${reason})` : ''}.`);
  }
  return output;
};

// Google recommends the Interactions API for new projects (generateContent is legacy). It is used
// whenever the installed @google/genai exposes it. If the SDK fails locally (no HTTP status, e.g.
// "Unexpected HTTP client error"), the same prompt is sent with a direct REST generateContent call.
const generateText = async (client, modelName, text, config, signal) => {
  if (typeof client?.interactions?.create === 'function') {
    const request = { model: modelName, input: text };
    if (config.responseMimeType) request.response_format = { type: 'text', mime_type: config.responseMimeType };
    if (config.temperature !== undefined) request.generation_config = { temperature: config.temperature };
    try {
      const interaction = await client.interactions.create(request);
      return textFromInteraction(interaction);
    } catch (error) {
      if (signal.aborted || errorStatus(error) !== undefined) throw error;
      console.warn(`[Gemini] SDK Interactions call failed locally (${error.message}); retrying with direct REST generateContent.`);
      return restGenerateContent(modelName, text, config, signal);
    }
  }
  const response = await client.models.generateContent({
    model: modelName,
    contents: text,
    config: { ...config, abortSignal: signal },
  });
  const output = typeof response?.text === 'string' ? response.text : '';
  if (!output.trim()) {
    const reason = response?.candidates?.[0]?.finishReason;
    throw new Error(`Gemini returned an empty response${reason ? ` (finish reason: ${reason})` : ''}.`);
  }
  return output;
};

/**
 * Try one model until it answers, fails permanently, runs out of attempts, or the deadline passes.
 */
const runModel = async (client, modelName, text, config, { attemptTimeout, deadlineAt, maxAttempts, retryBaseMs }) => {
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const remaining = deadlineAt - Date.now();
    if (remaining <= 500) break;
    const timeout = Math.min(attemptTimeout, remaining);
    try {
      const output = await callWithTimeout((signal) => generateText(client, modelName, text, config, signal), timeout);
      if (!output.trim()) throw new Error('Gemini returned an empty response.');
      return output;
    } catch (error) {
      lastError = error;
      console.warn(`[Gemini] attempt ${attempt + 1}/${maxAttempts} failed (model=${modelName}, status=${errorStatus(error) ?? (error.isTimeout ? 'timeout' : 'n/a')}): ${error.message}${error.cause ? ` | cause: ${error.cause?.message || error.cause}` : ''}`);
      if (!isTransient(error) || attempt === maxAttempts - 1) break;
      const wait = backoff(attempt, retryBaseMs);
      if (deadlineAt - Date.now() <= wait + 500) break;
      await sleep(wait);
    }
  }
  throw lastError || new GeminiTimeoutError(attemptTimeout);
};

const friendlyError = (error, modelName) => {
  const status = errorStatus(error);
  const rawMessage = error?.message || 'Unknown Gemini error';
  let wrapped;
  if (error?.isTimeout) {
    wrapped = new Error('The AI service took too long to respond. Please try again in a moment.');
    wrapped.statusCode = 504;
    wrapped.code = 'GEMINI_TIMEOUT';
  } else if (status === 503 || /overloaded|unavailable|high demand/i.test(rawMessage) && status !== 429) {
    wrapped = new Error('The AI service (Gemini) is busy right now. Nothing is wrong with your account or resume. Please wait a minute and try again.');
    wrapped.statusCode = 503;
    wrapped.code = 'GEMINI_OVERLOADED';
  } else if (status === 429) {
    wrapped = new Error('The Gemini rate limit or quota was reached. Wait a minute and try again, or check your Gemini API quota.');
    wrapped.statusCode = 429;
    wrapped.code = 'GEMINI_RATE_LIMITED';
  } else {
    const cleanMessage = String(rawMessage).replace(/[.\s]+$/, '');
    wrapped = new Error(`Gemini request failed (model ${modelName}${status ? `, HTTP ${status}` : ''}): ${cleanMessage}.${hintFor(status, rawMessage, modelName)}`);
    wrapped.statusCode = 502;
  }
  wrapped.upstreamStatus = status;
  wrapped.upstreamMessage = rawMessage; // for server logs only
  return wrapped;
};

/**
 * Send a prompt to Gemini and return the response text. Never waits longer than the deadline.
 * @param {string} prompt
 * @param {{json?: boolean, temperature?: number, timeoutMs?: number, deadlineMs?: number,
 *          maxAttempts?: number, retryBaseMs?: number, fallbackModel?: string}} [options]
 *        json=true requests application/json output.
 */
export const askGemini = async (prompt, { json = false, temperature, timeoutMs, deadlineMs, maxAttempts, retryBaseMs, fallbackModel } = {}) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('GEMINI_API_KEY is missing. Add it to server/.env.'), { statusCode: 500 });
  const text = String(prompt ?? '').trim();
  if (!text) throw new Error('Gemini prompt cannot be empty.');

  const modelName = getGeminiModel();
  console.log(`[Gemini] Using model: ${modelName}`);

  const client = await clientFactory(apiKey);
  const config = {};
  if (json) config.responseMimeType = 'application/json';
  if (temperature !== undefined) config.temperature = temperature;

  const limits = {
    attemptTimeout: num(timeoutMs, num(process.env.GEMINI_TIMEOUT_MS, 30000)),
    deadlineAt: Date.now() + num(deadlineMs, num(process.env.GEMINI_DEADLINE_MS, 75000)),
    maxAttempts: Math.round(num(maxAttempts, num(process.env.GEMINI_MAX_ATTEMPTS, 4))),
    retryBaseMs: num(retryBaseMs, num(process.env.GEMINI_RETRY_BASE_MS, 1000)),
  };

  let lastError;
  try {
    return await runModel(client, modelName, text, config, limits);
  } catch (error) {
    lastError = error;
  }

  // Optional second model, only when the first one was overloaded / too slow (never for 404, bad key, ...).
  const fallback = String(fallbackModel ?? process.env.GEMINI_FALLBACK_MODEL ?? '').trim();
  if (fallback && fallback !== modelName && isTransient(lastError) && limits.deadlineAt - Date.now() > 3000) {
    console.warn(`[Gemini] ${modelName} unavailable; trying GEMINI_FALLBACK_MODEL=${fallback}`);
    try {
      return await runModel(client, fallback, text, config, { ...limits, maxAttempts: 2 });
    } catch (error) {
      lastError = error;
    }
  }

  console.error(`[Gemini] Request failed (model=${modelName}, status=${errorStatus(lastError) ?? (lastError?.isTimeout ? 'timeout' : 'n/a')}): ${lastError?.message}`);
  throw friendlyError(lastError, modelName);
};