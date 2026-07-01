import OpenAI from 'openai';

export const GEMINI_MODEL = 'google/gemma-4-31b-it:free';

let client: OpenAI | null = null;

export function getAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
    client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://career-dashboard-ten.vercel.app',
        'X-Title': 'jobs_',
      },
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
