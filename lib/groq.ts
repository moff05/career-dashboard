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

// Groq's per-org tokens-per-minute budget is shared across every route AND
// every user of this multi-user app, so a call can 429 even when nothing
// about the request is wrong — just bad timing against other traffic in the
// same rolling minute. A single fit-scorecard call alone requests 5,000-
// 6,000+ tokens against this account's 8,000 TPM cap, so as real usage grows
// (confirmed live 2026-09-29: two jobs scored ~15s apart both 429'd, with
// other users' traffic already having consumed part of the budget before
// either request even started) a single retry isn't always enough — Groq's
// 429 always carries a `retry-after` header with the exact wait, so this
// keeps retrying (bounded by MAX_RETRIES and the time budget below) rather
// than giving up after one attempt.
// Every route calling this sets `maxDuration = 60` (Vercel's function-timeout
// ceiling on this project's plan). If an attempt itself was already slow,
// waiting the full retry-after and then repeating a similarly slow call can
// blow through that budget — which surfaces as an opaque platform "Task
// timed out" with no JSON error, not the friendly message the route's own
// catch block would otherwise return. Stop retrying (surface the most recent
// 429 immediately instead) once there isn't realistically enough time left
// for another attempt to land within budget.
//
// This is a mitigation, not a fix for the underlying cause: the account's
// 8,000 TPM ceiling is tight enough relative to a single call's token cost
// that at most ~1 large call can succeed per rolling minute even with zero
// contention. As real external usage grows (see CLAUDE.md), retrying harder
// only buys headroom — raising Groq's tier (their own error message points
// to "Dev Tier") is the actual structural fix once this starts recurring
// often enough to matter.
const MAX_DURATION_MS = 60_000;
const BUDGET_SAFETY_MARGIN_MS = 5_000;
const MAX_RETRIES = 3;

async function withGroqRetry<T>(attempt: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  let lastAttemptMs = 0;
  for (let retries = 0; ; retries++) {
    const attemptStartedAt = Date.now();
    try {
      const result = await attempt();
      lastAttemptMs = Date.now() - attemptStartedAt;
      return result;
    } catch (err) {
      lastAttemptMs = Date.now() - attemptStartedAt;
      if (!(err instanceof OpenAI.APIError && err.status === 429) || retries >= MAX_RETRIES) throw err;
      const retryAfterHeader = typeof err.headers?.get === 'function' ? err.headers.get('retry-after') : undefined;
      const retryAfterSec = Number(retryAfterHeader) || 5;
      const waitMs = Math.min(retryAfterSec, 20) * 1000;
      // Estimate the next attempt's duration as similar to the last one's.
      const elapsedMs = Date.now() - startedAt;
      const projectedTotalMs = elapsedMs + waitMs + lastAttemptMs;
      if (projectedTotalMs > MAX_DURATION_MS - BUDGET_SAFETY_MARGIN_MS) throw err;
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
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
