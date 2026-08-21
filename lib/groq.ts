import OpenAI from 'openai';

// llama-3.3-70b-versatile was removed from Groq's lineup (404 model_not_found
// as of 2026-08-21) — replaced with openai/gpt-oss-120b, verified compatible
// with the JSON-mode extraction pattern every route here relies on.
export const GEMINI_MODEL = 'openai/gpt-oss-120b';

let client: OpenAI | null = null;

export function getAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY is not set');
    client = new OpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey,
    });
  }
  return client;
}

// Keep this export name so routes don't need updating
export function getModel(systemInstruction?: string) {
  return { client: getAIClient(), systemInstruction };
}

// Translate OpenAI usage to logUsage format
export function geminiUsage(usage?: { prompt_tokens?: number; completion_tokens?: number } | null) {
  return {
    input_tokens: usage?.prompt_tokens || 0,
    output_tokens: usage?.completion_tokens || 0,
  };
}
