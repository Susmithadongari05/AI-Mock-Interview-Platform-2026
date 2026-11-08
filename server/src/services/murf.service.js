// ============================================
// murf.service.js - Murf text-to-speech
// ============================================
// POST https://api.murf.ai/v1/speech/generate  (header: api-key)
// Required body fields: text, voiceId. The response contains `audioFile` (URL).
// Reference: https://murf.ai/api/docs/api-reference/text-to-speech/generate
// ============================================

const MAX_TTS_CHARS = 3000;

const failure = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const generateSpeech = async (text) => {
  const apiKey = process.env.MURF_API_KEY;
  if (!apiKey) throw failure('Text-to-speech is not configured: MURF_API_KEY is missing in server/.env.', 503);

  const input = String(text ?? '').trim();
  if (!input) throw failure('Text is required for speech generation.', 400);

  let response;
  try {
    response = await fetch('https://api.murf.ai/v1/speech/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        text: input.slice(0, MAX_TTS_CHARS),
        voiceId: process.env.MURF_VOICE_ID || 'en-US-natalie',
        style: 'Conversational',
        format: 'MP3',
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    throw failure(`Murf request failed: ${error.name === 'TimeoutError' ? 'timed out after 30s' : error.message}`, 502);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw failure(`Murf API error: ${response.status} ${errorText}`.trim(), 502);
  }

  const data = await response.json();
  return data.audioFile || data.audioFileUrl || data.url || null;
};

export { generateSpeech };
