import OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';

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

// Groq's per-org tokens-per-minute budget is shared across every route on
// this account, so a call can 429 even when nothing about the request is
// wrong — just bad timing against other traffic in the same rolling minute.
// Groq's 429 always carries a `retry-after` header with the exact wait, so
// one retry after that delay clears the large majority of these instead of
// surfacing a hard failure to the user.
export async function createChatCompletion(client: OpenAI, params: ChatCompletionCreateParamsNonStreaming) {
  try {
    return await client.chat.completions.create(params);
  } catch (err) {
    if (err instanceof OpenAI.APIError && err.status === 429) {
      const retryAfterHeader = typeof err.headers?.get === 'function' ? err.headers.get('retry-after') : undefined;
      const retryAfterSec = Number(retryAfterHeader) || 5;
      await new Promise(resolve => setTimeout(resolve, Math.min(retryAfterSec, 20) * 1000));
      return await client.chat.completions.create(params);
    }
    throw err;
  }
}

// Translate OpenAI usage to logUsage format
export function geminiUsage(usage?: { prompt_tokens?: number; completion_tokens?: number } | null) {
  return {
    input_tokens: usage?.prompt_tokens || 0,
    output_tokens: usage?.completion_tokens || 0,
  };
}
