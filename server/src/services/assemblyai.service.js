import { AssemblyAI } from 'assemblyai';

const transcribeAudio = async (audioBuffer) => {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'ASSEMBLYAI_API_KEY is not defined in your .env file.'
    );
  }

  if (!audioBuffer || !audioBuffer.length) {
    throw new Error('Audio data is required.');
  }

  const client = new AssemblyAI({
    apiKey,
  });

  const uploadUrl = await client.files.upload(audioBuffer);

  const transcript = await client.transcripts.transcribe({
    audio: uploadUrl,
  });

  if (transcript.status === 'error') {
    throw new Error(
      transcript.error || 'Audio transcription failed.'
    );
  }

  return transcript.text || '';
};

export { transcribeAudio };