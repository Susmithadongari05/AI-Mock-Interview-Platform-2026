
// ============================================
// geminiService.js - Google Gemini access
// ============================================

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const OVERLOADED_STATUSES = new Set([429, 503]);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const getGeminiModel = (env = process.env) =>
  String(env.GEMINI_MODEL || '').trim() || DEFAULT_GEMINI_MODEL;

const defaultFactory = async apiKey => {
  const { GoogleGenAI } = await import('@google/genai');
  return new GoogleGenAI({ apiKey });
};

let clientFactory = defaultFactory;

export const __setGeminiClientFactory = factory => {
  clientFactory = factory || defaultFactory;
};

const errorStatus = error =>
  Number(
    error?.status ??
      error?.statusCode ??
      error?.code ??
      error?.response?.status,
  ) || undefined;

const hintFor = (status, message, modelName) => {
  if (
    status === 404 ||
    /no longer available|not found|not supported for generateContent/i.test(message)
  ) {
    return ` The model "${modelName}" was rejected by the API. Check the supported models at https://ai.google.dev/gemini-api/docs/models and update GEMINI_MODEL in server/.env.`;
  }

  if (status === 400 && /api key/i.test(message)) {
    return ' The API key looks invalid. Check GEMINI_API_KEY.';
  }

  if (status === 401 || status === 403) {
    return ' The API key was rejected or lacks access. Check GEMINI_API_KEY and ensure the Gemini API is enabled.';
  }

  if (status === 429) {
    return ' The Gemini API rate limit or quota was reached. Check your API quota or try an available fallback model.';
  }

  return '';
};

const num = (value, fallback) =>
  Number(value) > 0 ? Number(value) : fallback;

class GeminiTimeoutError extends Error {
  constructor(ms) {
    super(`Gemini did not respond within ${Math.round(ms / 1000)} seconds`);
    this.name = 'GeminiTimeoutError';
    this.isTimeout = true;
  }
}

const callWithTimeout = (start, ms) =>
  new Promise((resolve, reject) => {
    const controller = new AbortController();

    const timer = setTimeout(() => {
      controller.abort();
      reject(new GeminiTimeoutError(ms));
    }, ms);

    start(controller.signal).then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

const backoff = (attempt, baseMs) =>
  baseMs * 2 ** attempt +
  Math.floor(Math.random() * baseMs * 0.25);

const isOverload = error =>
  OVERLOADED_STATUSES.has(errorStatus(error)) ||
  /overloaded|unavailable|high demand/i.test(error?.message || '');

const isDailyQuota = error =>
  errorStatus(error) === 429 &&
  /per ?day|daily|requests per day|free.?tier quota/i.test(
    error?.message || '',
  );

const isTransient = error =>
  !isDailyQuota(error) &&
  (error?.isTimeout ||
    RETRYABLE_STATUSES.has(errorStatus(error)) ||
    isOverload(error));

const textFromInteraction = interaction => {
  if (
    typeof interaction?.output_text === 'string' &&
    interaction.output_text
  ) {
    return interaction.output_text;
  }

  const steps = Array.isArray(interaction?.steps)
    ? interaction.steps
    : [];

  return steps
    .filter(step => step?.type === 'model_output')
    .flatMap(step =>
      Array.isArray(step.content) ? step.content : [],
    )
    .filter(
      part =>
        part?.type === 'text' &&
        typeof part.text === 'string',
    )
    .map(part => part.text)
    .join('');
};

// ============================================
// Direct REST request to Gemini
// ============================================

const restGenerateContent = async (
  modelName,
  text,
  config,
  signal,
) => {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text }],
      },
    ],
    generationConfig: {},
  };

  if (config.responseMimeType) {
    body.generationConfig.responseMimeType =
      config.responseMimeType;
  }

  if (config.temperature !== undefined) {
    body.generationConfig.temperature = config.temperature;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      modelName,
    )}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
      signal,
    },
  );

  const raw = await response.text();

  if (!response.ok) {
    let message = raw;

    try {
      message = JSON.parse(raw)?.error?.message || raw;
    } catch {
      // Keep the original error response.
    }

    throw Object.assign(new Error(message), {
      status: response.status,
    });
  }

  const data = JSON.parse(raw);

  const output = (
    data?.candidates?.[0]?.content?.parts || []
  )
    .map(part => part?.text || '')
    .join('');

  if (!output.trim()) {
    const reason =
      data?.candidates?.[0]?.finishReason ||
      data?.promptFeedback?.blockReason;

    throw new Error(
      `Gemini returned an empty response${
        reason ? ` (finish reason: ${reason})` : ''
      }.`,
    );
  }

  return output;
};

// ============================================
// Generate text using REST or a custom SDK
// ============================================

const generateText = async (
  client,
  modelName,
  text,
  config,
  signal,
) => {
  if (!client) {
    return restGenerateContent(
      modelName,
      text,
      config,
      signal,
    );
  }

  if (typeof client?.interactions?.create === 'function') {
    const request = {
      model: modelName,
      input: text,
    };

    if (config.responseMimeType) {
      request.response_format = {
        type: 'text',
        mime_type: config.responseMimeType,
      };
    }

    if (config.temperature !== undefined) {
      request.generation_config = {
        temperature: config.temperature,
      };
    }

    try {
      const interaction =
        await client.interactions.create(request);

      return textFromInteraction(interaction);
    } catch (error) {
      if (
        signal.aborted ||
        errorStatus(error) !== undefined
      ) {
        throw error;
      }

      console.warn(
        `[Gemini] SDK call failed: ${error.message}. Trying REST.`,
      );

      return restGenerateContent(
        modelName,
        text,
        config,
        signal,
      );
    }
  }

  const response = await client.models.generateContent({
    model: modelName,
    contents: text,
    config: {
      ...config,
      abortSignal: signal,
    },
  });

  const output =
    typeof response?.text === 'string'
      ? response.text
      : '';

  if (!output.trim()) {
    const reason = response?.candidates?.[0]?.finishReason;

    throw new Error(
      `Gemini returned an empty response${
        reason ? ` (finish reason: ${reason})` : ''
      }.`,
    );
  }

  return output;
};

// ============================================
// Try a model with retries and timeouts
// ============================================

const runModel = async (
  client,
  modelName,
  text,
  config,
  {
    attemptTimeout,
    deadlineAt,
    maxAttempts,
    retryBaseMs,
  },
) => {
  let lastError;

  for (
    let attempt = 0;
    attempt < maxAttempts;
    attempt += 1
  ) {
    const remaining = deadlineAt - Date.now();

    if (remaining <= 500) {
      break;
    }

    const timeout = Math.min(
      attemptTimeout,
      remaining,
    );

    try {
      const output = await callWithTimeout(
        signal =>
          generateText(
            client,
            modelName,
            text,
            config,
            signal,
          ),
        timeout,
      );

      if (!output.trim()) {
        throw new Error(
          'Gemini returned an empty response.',
        );
      }

      return output;
    } catch (error) {
      lastError = error;

      console.warn(
        `[Gemini] Attempt ${attempt + 1}/${maxAttempts} failed`,
        {
          model: modelName,
          status:
            errorStatus(error) ??
            (error.isTimeout ? 'timeout' : 'n/a'),
          message: error.message,
        },
      );

      if (
        !isTransient(error) ||
        attempt === maxAttempts - 1
      ) {
        break;
      }

      const wait = backoff(
        attempt,
        retryBaseMs,
      );

      if (
        deadlineAt - Date.now() <=
        wait + 500
      ) {
        break;
      }

      await sleep(wait);
    }
  }

  throw (
    lastError ||
    new GeminiTimeoutError(attemptTimeout)
  );
};

// ============================================
// Convert Gemini errors into useful messages
// ============================================

const friendlyError = (error, modelName) => {
  const status = errorStatus(error);
  const rawMessage =
    error?.message || 'Unknown Gemini error';

  let wrapped;

  if (error?.isTimeout) {
    wrapped = new Error(
      'The AI service took too long to respond. Please try again.',
    );

    wrapped.statusCode = 504;
    wrapped.code = 'GEMINI_TIMEOUT';
  } else if (
    status === 503 ||
    (/overloaded|unavailable|high demand/i.test(
      rawMessage,
    ) &&
      status !== 429)
  ) {
    wrapped = new Error(
      'Gemini is temporarily busy. Please try again shortly.',
    );

    wrapped.statusCode = 503;
    wrapped.code = 'GEMINI_OVERLOADED';
  } else if (isDailyQuota(error)) {
    wrapped = new Error(
      'Your Gemini daily free-tier quota is exhausted. ' +
        'Wait for the quota to reset, enable billing if appropriate, ' +
        'or configure a different model with available quota.',
    );

    wrapped.statusCode = 429;
    wrapped.code = 'GEMINI_DAILY_QUOTA';
  } else if (status === 429) {
    wrapped = new Error(
      'The Gemini rate limit or quota was reached. ' +
        'Wait and try again, or check your API quota.',
    );

    wrapped.statusCode = 429;
    wrapped.code = 'GEMINI_RATE_LIMITED';
  } else {
    const cleanMessage = String(rawMessage).replace(
      /[.\s]+$/,
      '',
    );

    wrapped = new Error(
      `Gemini request failed (model ${modelName}${
        status ? `, HTTP ${status}` : ''
      }): ${cleanMessage}.${hintFor(
        status,
        rawMessage,
        modelName,
      )}`,
    );

    wrapped.statusCode = 502;
  }

  wrapped.upstreamStatus = status;
  wrapped.upstreamMessage = rawMessage;

  return wrapped;
};

// ============================================
// Public function used by the application
// ============================================

export const askGemini = async (
  prompt,
  {
    json = false,
    temperature,
    timeoutMs,
    deadlineMs,
    maxAttempts,
    retryBaseMs,
    fallbackModel,
  } = {},
) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw Object.assign(
      new Error(
        'GEMINI_API_KEY is missing. Add it to server/.env.',
      ),
      { statusCode: 500 },
    );
  }

  const text = String(prompt ?? '').trim();

  if (!text) {
    throw new Error(
      'Gemini prompt cannot be empty.',
    );
  }

  const modelName = getGeminiModel();

  console.log(
    `[Gemini] Using primary model: ${modelName}`,
  );

  const client =
    clientFactory === defaultFactory
      ? null
      : await clientFactory(apiKey);

  const config = {};

  if (json) {
    config.responseMimeType = 'application/json';
  }

  if (temperature !== undefined) {
    config.temperature = temperature;
  }

  // One 12-second primary attempt, then one fallback attempt.
  // Overall deadline: 30 seconds.
  const limits = {
    attemptTimeout: num(
      timeoutMs,
      num(
        process.env.GEMINI_TIMEOUT_MS,
        12000,
      ),
    ),

    deadlineAt:
      Date.now() +
      num(
        deadlineMs,
        num(
          process.env.GEMINI_DEADLINE_MS,
          30000,
        ),
      ),

    maxAttempts: Math.round(
      num(
        maxAttempts,
        num(
          process.env.GEMINI_MAX_ATTEMPTS,
          1,
        ),
      ),
    ),

    retryBaseMs: num(
      retryBaseMs,
      num(
        process.env.GEMINI_RETRY_BASE_MS,
        1000,
      ),
    ),
  };

  // IMPORTANT: Declare lastError before using it in catch blocks.
  let lastError;

  // Try the primary model first.
  try {
    return await runModel(
      client,
      modelName,
      text,
      config,
      limits,
    );
  } catch (error) {
    lastError = error;
  }

  // Try the fallback for temporary failures or exhausted quota.
  const fallback = String(
    fallbackModel ??
      process.env.GEMINI_FALLBACK_MODEL ??
      '',
  ).trim();

  const shouldTryFallback =
    fallback &&
    fallback !== modelName &&
    (
      isTransient(lastError) ||
      isDailyQuota(lastError)
    ) &&
    limits.deadlineAt - Date.now() > 3000;

  if (shouldTryFallback) {
    console.warn(
      `[Gemini] Primary model failed. Trying fallback: ${fallback}`,
    );

    try {
      return await runModel(
        client,
        fallback,
        text,
        config,
        {
          ...limits,
          maxAttempts: 1,
        },
      );
    } catch (error) {
      lastError = error;
    }
  }

  console.error(
    `[Gemini] Request failed. Model: ${modelName}.`,
    lastError?.message,
  );

  throw friendlyError(
    lastError,
    modelName,
  );
};
