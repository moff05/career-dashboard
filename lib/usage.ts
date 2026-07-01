import { getDb } from '@/lib/db';

// $ per token. Source: platform.claude.com/docs/en/pricing — keep in sync if
// the dashboard starts calling other models.
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  'claude-haiku-4-5-20251001': { input: 1 / 1_000_000, output: 5 / 1_000_000 },
  'gemini-2.0-flash': { input: 0.10 / 1_000_000, output: 0.40 / 1_000_000 },
  'meta-llama/llama-3.3-70b-instruct:free': { input: 0, output: 0 },
};

// Cache writes use the 5-minute TTL (the only TTL this app sets) at 1.25x
// input price; cache reads are 0.1x input price. Web search is a flat fee
// per call, billed separately from tokens.
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;
const WEB_SEARCH_COST_PER_CALL = 10 / 1000;

// Loosely typed on purpose: some call sites go through `anthropic.beta.messages`
// cast to `any` (web search beta), so `usage` won't always match the SDK's
// strict `Usage` type. Duck-typing here keeps every call site a one-liner.
export interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

export function computeCost(model: string, usage: UsageLike): number {
  const price = PRICING[model] ?? PRICING['claude-haiku-4-5-20251001'];
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
