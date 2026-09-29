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

// deadlineAtMs is an absolute Date.now()-style timestamp for when the
// CALLER'S OVERALL request must finish by (not this one call). Without it,
// each call's budget resets to a fresh MAX_DURATION_MS from its own start —
// harmless for a route that only ever makes one call per invocation (analyze
// on a single job), but dangerous for a caller that scores several jobs in
// one function invocation (the board scan, lib/scanBoards.ts): a candidate
// scored late in that loop could still "budget" itself a fresh 55s of
// retries even though the actual Vercel function has only seconds left —
// confirmed live 2026-09-29, POST /api/discovered/refresh 504'd
// (FUNCTION_INVOCATION_TIMEOUT) scoring a real user's real candidates for
// exactly this reason. Callers that score multiple items per invocation
// MUST pass their own shared startedAt-derived deadline through.
//
// PER_ATTEMPT_TIMEOUT_MS guards a different failure mode from the retry
// logic below: retries only kick in on a 429 the SDK actually throws, but
// the same 504 above showed zero logged errors at all — the request was
// just silently slow (Groq itself taking a long time to respond under load,
// not erroring), which nothing here previously bounded. Every attempt now
// gets an explicit request timeout so a single hung call fails fast and
// cleanly (the per-candidate try/catch in scanBoards.ts skips it and moves
// on) instead of silently eating the rest of the function's real budget.
const PER_ATTEMPT_TIMEOUT_MS = 20_000;

// maxRetries: 0 disables the OpenAI SDK's OWN built-in retry (default 2,
// meant for generic 5xx/network errors) — confirmed live 2026-09-29 that a
// single candidate in the board scan could still take ~20s+ even with the
// fixes above, consistent with the SDK silently retrying a 429 internally
// BEFORE it ever reaches withGroqRetry's own catch block below, stacking
// two independent retry layers with no shared awareness of the real
// deadline or of Groq's retry-after header. withGroqRetry is the only
// retry layer now — it already handles 429s correctly (honors retry-after,
// respects the caller's real deadline), the SDK's generic one doesn't.

export async function withGroqRetry<T>(attempt: (timeoutMs: number) => Promise<T>, deadlineAtMs?: number): Promise<T> {
  const hardDeadline = deadlineAtMs ?? Date.now() + MAX_DURATION_MS - BUDGET_SAFETY_MARGIN_MS;
  let lastAttemptMs = 0;
  for (let retries = 0; ; retries++) {
    const attemptStartedAt = Date.now();
    const timeoutMs = Math.max(1000, Math.min(PER_ATTEMPT_TIMEOUT_MS, hardDeadline - attemptStartedAt));
    try {
      const result = await attempt(timeoutMs);
      lastAttemptMs = Date.now() - attemptStartedAt;
      return result;
    } catch (err) {
      lastAttemptMs = Date.now() - attemptStartedAt;
      if (!(err instanceof OpenAI.APIError && err.status === 429) || retries >= MAX_RETRIES) throw err;
      const retryAfterHeader = typeof err.headers?.get === 'function' ? err.headers.get('retry-after') : undefined;
      const retryAfterSec = Number(retryAfterHeader) || 5;
      const waitMs = Math.min(retryAfterSec, 20) * 1000;
      // Estimate the next attempt's duration as similar to the last one's.
      const projectedFinishAt = Date.now() + waitMs + lastAttemptMs;
      if (projectedFinishAt > hardDeadline) throw err;
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
}

export async function createChatCompletion(client: OpenAI, params: ChatCompletionCreateParamsNonStreaming, deadlineAtMs?: number) {
  return withGroqRetry((timeoutMs) => client.chat.completions.create(params, { timeout: timeoutMs, maxRetries: 0 }), deadlineAtMs);
}

// Streaming variant — the retry only ever applies to the *initial* request
// (a 429 on that surfaces before any chunk reaches the client), never to a
// stream that's already partway through sending content.
export async function createChatCompletionStream(client: OpenAI, params: ChatCompletionCreateParamsStreaming, deadlineAtMs?: number) {
  return withGroqRetry((timeoutMs) => client.chat.completions.create(params, { timeout: timeoutMs, maxRetries: 0 }), deadlineAtMs);
}

// Translate OpenAI usage to logUsage format
export function geminiUsage(usage?: { prompt_tokens?: number; completion_tokens?: number } | null) {
  return {
    input_tokens: usage?.prompt_tokens || 0,
    output_tokens: usage?.completion_tokens || 0,
  };
}
