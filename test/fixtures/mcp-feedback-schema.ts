/**
 * Pure validation + hashing for MCP agent feedback reports. No I/O, no DB,
 * no imports from the request path — so it is unit-testable and cannot
 * affect any other route.
 */
import { createHash } from "node:crypto";

export const FEEDBACK_CATEGORIES = [
  "tool_error",
  "unexpected_result",
  "confusing_response",
  "missing_capability",
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_LIMITS = {
  bodyBytes: 16 * 1024,
  summary: 200,
  text: 2000,
  identifier: 120,
  short: 64,
  idempotencyKey: 128,
} as const;

export const FEEDBACK_RATE_LIMIT_PER_HOUR = 30;
export const FEEDBACK_DEDUPE_WINDOW_HOURS = 24;

export type FeedbackInput = {
  category: FeedbackCategory;
  tool_name: string;
  summary: string;
  expected_behavior: string;
  observed_behavior: string;
  customer_blocked: boolean;
  occurred_at?: string;
  quote_id?: string;
  shipment_id?: string;
  request_id?: string;
  error_code?: string;
  client?: string;
  mcp_version?: string;
};

const REQUIRED = ["category", "tool_name", "summary", "expected_behavior", "observed_behavior", "customer_blocked"] as const;
const OPTIONAL = ["occurred_at", "quote_id", "shipment_id", "request_id", "error_code", "client", "mcp_version"] as const;
const ALLOWED = new Set<string>([...REQUIRED, ...OPTIONAL]);

// Things that must never be stored: API keys, Stripe keys, bearer tokens,
// card-number-shaped digit runs. The report is rejected, not redacted, so the
// assistant learns to leave them out.
const SENSITIVE_PATTERNS: Array<[RegExp, string]> = [
  [/wak_(?:live|test)_[A-Za-z0-9_-]{8,}/, "a Warp API key"],
  [/\bsk_(?:live|test)_[A-Za-z0-9]{8,}/, "a Stripe secret key"],
  [/\bBearer\s+[A-Za-z0-9._-]{20,}/i, "a bearer token"],
  [/\b(?:\d[ -]?){13,19}\b/, "a card-number-like digit sequence"],
];

const IDENT = /^[A-Za-z0-9._:\-]+$/;
const TOOL = /^[a-z0-9_\-]{1,64}$/i;

export type ValidationResult =
  | { ok: true; value: FeedbackInput }
  | { ok: false; error: string };

function str(v: unknown, max: number, field: string, pattern?: RegExp): string | { error: string } {
  if (typeof v !== "string") return { error: `${field} must be a string.` };
  const t = v.trim();
  if (!t) return { error: `${field} must not be empty.` };
  if (t.length > max) return { error: `${field} must be at most ${max} characters.` };
  if (pattern && !pattern.test(t)) return { error: `${field} contains unsupported characters.` };
  return t;
}

export function validateFeedback(body: unknown): ValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const obj = body as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (!ALLOWED.has(k)) return { ok: false, error: `Unsupported field: ${k}.` };
  }
  for (const k of REQUIRED) {
    if (obj[k] === undefined || obj[k] === null) return { ok: false, error: `${k} is required.` };
  }
  if (typeof obj.category !== "string" || !(FEEDBACK_CATEGORIES as readonly string[]).includes(obj.category)) {
    return { ok: false, error: `category must be one of: ${FEEDBACK_CATEGORIES.join(", ")}.` };
  }
  if (typeof obj.customer_blocked !== "boolean") return { ok: false, error: "customer_blocked must be true or false." };

  const tool = str(obj.tool_name, FEEDBACK_LIMITS.short, "tool_name", TOOL);
  if (typeof tool !== "string") return { ok: false, error: tool.error };
  const summary = str(obj.summary, FEEDBACK_LIMITS.summary, "summary");
  if (typeof summary !== "string") return { ok: false, error: summary.error };
  const expected = str(obj.expected_behavior, FEEDBACK_LIMITS.text, "expected_behavior");
  if (typeof expected !== "string") return { ok: false, error: expected.error };
  const observed = str(obj.observed_behavior, FEEDBACK_LIMITS.text, "observed_behavior");
  if (typeof observed !== "string") return { ok: false, error: observed.error };

  const value: FeedbackInput = {
    category: obj.category as FeedbackCategory,
    tool_name: tool,
    summary,
    expected_behavior: expected,
    observed_behavior: observed,
    customer_blocked: obj.customer_blocked,
  };

  if (obj.occurred_at !== undefined && obj.occurred_at !== null) {
    if (typeof obj.occurred_at !== "string" || Number.isNaN(Date.parse(obj.occurred_at))) {
      return { ok: false, error: "occurred_at must be an ISO 8601 timestamp." };
    }
    value.occurred_at = new Date(obj.occurred_at).toISOString();
  }
  const idFields: Array<[keyof FeedbackInput, number, RegExp]> = [
    ["quote_id", FEEDBACK_LIMITS.identifier, IDENT],
    ["shipment_id", FEEDBACK_LIMITS.identifier, IDENT],
    ["request_id", FEEDBACK_LIMITS.identifier, IDENT],
    ["error_code", FEEDBACK_LIMITS.short, IDENT],
    ["client", FEEDBACK_LIMITS.short, IDENT],
    ["mcp_version", FEEDBACK_LIMITS.short, IDENT],
  ];
  for (const [field, max, pattern] of idFields) {
    const raw = obj[field];
    if (raw === undefined || raw === null || raw === "") continue;
    const s = str(raw, max, field, pattern);
    if (typeof s !== "string") return { ok: false, error: s.error };
    (value as Record<string, unknown>)[field] = s;
  }

  for (const text of [value.summary, value.expected_behavior, value.observed_behavior]) {
    for (const [re, what] of SENSITIVE_PATTERNS) {
      if (re.test(text)) return { ok: false, error: `Report text contains ${what}. Remove it and resubmit.` };
    }
  }
  return { ok: true, value };
}

/** Stable per-account grouping key: same tool + category + error + linked operation. */
export function feedbackFingerprint(agentId: string, v: FeedbackInput): string {
  const parts = [agentId, v.tool_name.toLowerCase(), v.category, v.error_code ?? "", v.quote_id ?? "", v.shipment_id ?? ""];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/** Hash of the validated body with sorted keys, for idempotency conflict detection. */
export function feedbackBodyHash(v: FeedbackInput): string {
  const sorted = Object.keys(v).sort().reduce<Record<string, unknown>>((acc, k) => {
    acc[k] = (v as Record<string, unknown>)[k];
    return acc;
  }, {});
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

export function isFeedbackEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|true|on|yes)$/i.test((env.FEEDBACK_API_ENABLED ?? "").trim());
}

export function validateIdempotencyKey(raw: string | null): string | null | { error: string } {
  if (raw === null) return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.length > FEEDBACK_LIMITS.idempotencyKey || !IDENT.test(t)) return { error: "Idempotency-Key must be 1-128 characters of letters, digits, dots, colons, hyphens or underscores." };
  return t;
}
