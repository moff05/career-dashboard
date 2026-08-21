import { getDb } from '@/lib/db';

// $ per token. Source: console.groq.com/docs/openai — keep in sync if models change.
// llama-3.3-70b-versatile and qwen/qwen3-32b were both removed from Groq's
// lineup 2026-08-21 (404 model_not_found) — replaced below. Third-party
// aggregator pricing (Groq's own pricing page wasn't fetchable to confirm
// directly) — worth double-checking against console.groq.com/docs/models
// once real usage volume makes accuracy matter.
const PRICING: Record<string, { input: number; output: number }> = {
  'openai/gpt-oss-120b': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  'qwen/qwen3.6-27b': { input: 0.60 / 1_000_000, output: 3.00 / 1_000_000 },
};

// Groq does not charge for prompt caching or web search — these multipliers
// are kept at neutral values so the schema stays consistent if providers change.
const CACHE_WRITE_MULTIPLIER = 0;
const CACHE_READ_MULTIPLIER = 0;
const WEB_SEARCH_COST_PER_CALL = 0;

// Loosely typed — duck-typing keeps every call site a one-liner.
export interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

export function computeCost(model: string, usage: UsageLike): number {
  const price = PRICING[model] ?? PRICING['openai/gpt-oss-120b'];
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const webSearches = usage.server_tool_use?.web_search_requests || 0;

  return (
    inputTokens * price.input +
    outputTokens * price.output +
    cacheWrite * price.input * CACHE_WRITE_MULTIPLIER +
    cacheRead * price.input * CACHE_READ_MULTIPLIER +
    webSearches * WEB_SEARCH_COST_PER_CALL
  );
}

let tableEnsured = false;
export async function ensureUsageTable() {
  if (tableEnsured) return;
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'anonymous',
    route TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
    web_search_requests INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  tableEnsured = true;
}

// Best-effort — a logging failure must never break the AI feature that
// triggered it, so every error is swallowed here rather than thrown.
export async function logUsage(userId: string, route: string, model: string, usage: UsageLike): Promise<void> {
  try {
    await ensureUsageTable();
    const db = getDb();
    const cost = computeCost(model, usage);
    await db.execute({
      sql: `INSERT INTO usage_log
        (user_id, route, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, web_search_requests, cost_usd)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        userId,
        route,
        model,
        usage.input_tokens || 0,
        usage.output_tokens || 0,
        usage.cache_creation_input_tokens || 0,
        usage.cache_read_input_tokens || 0,
        usage.server_tool_use?.web_search_requests || 0,
        cost,
      ],
    });
  } catch (err) {
    console.error('logUsage failed:', err);
  }
}
