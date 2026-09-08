import OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming, ChatCompletionCreateParamsStreaming } from 'openai/resources/chat/completions';

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
// Every route calling this sets `maxDuration = 60` (Vercel's function-timeout
// ceiling on this project's plan). If the first attempt itself was already
// slow, waiting the full retry-after and then repeating a similarly slow
// call can blow through that budget — which surfaces as an opaque platform
// "Task timed out" with no JSON error, not the friendly message the route's
// own catch block would otherwise return. Skip the retry (surface the
// original 429 immediately instead) when there isn't realistically enough
// time left for it to land within budget.
const MAX_DURATION_MS = 60_000;
const BUDGET_SAFETY_MARGIN_MS = 5_000;

async function withGroqRetry<T>(attempt: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    return await attempt();
  } catch (err) {
    if (err instanceof OpenAI.APIError && err.status === 429) {
      const firstAttemptMs = Date.now() - startedAt;
      const retryAfterHeader = typeof err.headers?.get === 'function' ? err.headers.get('retry-after') : undefined;
      const retryAfterSec = Number(retryAfterHeader) || 5;
      const waitMs = Math.min(retryAfterSec, 20) * 1000;
      // Estimate the retry's duration as similar to the first attempt's.
      const projectedTotalMs = firstAttemptMs + waitMs + firstAttemptMs;
      if (projectedTotalMs > MAX_DURATION_MS - BUDGET_SAFETY_MARGIN_MS) throw err;
      await new Promise(resolve => setTimeout(resolve, waitMs));
      return await attempt();
    }
    throw err;
  }
}

export async function createChatCompletion(client: OpenAI, params: ChatCompletionCreateParamsNonStreaming) {
  return withGroqRetry(() => client.chat.completions.create(params));
}

// Streaming variant — the retry only ever applies to the *initial* request
// (a 429 on that surfaces before any chunk reaches the client), never to a
// stream that's already partway through sending content.
export async function createChatCompletionStream(client: OpenAI, params: ChatCompletionCreateParamsStreaming) {
  return withGroqRetry(() => client.chat.completions.create(params));
}

// Translate OpenAI usage to logUsage format
export function geminiUsage(usage?: { prompt_tokens?: number; completion_tokens?: number } | null) {
  return {
    input_tokens: usage?.prompt_tokens || 0,
    output_tokens: usage?.completion_tokens || 0,
  };
}
