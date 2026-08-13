import { createHmac, randomBytes } from "node:crypto"

const PROCESS_FINGERPRINT_KEY = randomBytes(32)

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]{12,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{12,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /(?<key>token|secret|password|passphrase|apikey|api_key|authorization)\s*[=:]\s*(?:bearer\s+)?[^\s"',}]+/gi,
  /:\/\/[^\s/:@]+:[^\s/@]+@/g,
]

export function safeStringify(input: unknown): string {
  if (typeof input === "string") return input
  const seen = new WeakSet<object>()
  try {
    const value = JSON.stringify(input ?? "", (_key, item: unknown) => {
      if (typeof item === "bigint") return `${item.toString()}n`
      if (typeof item === "object" && item !== null) {
        if (seen.has(item)) return "<circular>"
        seen.add(item)
      }
      return item
    })
    return value ?? String(input ?? "")
  } catch {
    return String(input ?? "")
  }
}

export function redactSensitive(input: unknown): string {
  let text = safeStringify(input)
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (...args: unknown[]) => {
      const groups = args.at(-1)
      const key = typeof groups === "object" && groups !== null && "key" in groups
        ? String((groups as { key?: unknown }).key ?? "secret")
        : "secret"
      return `${key}=<redacted>`
    })
  }
  return text
}

export function stableFingerprint(input: unknown, prefix = "fp"): string {
  const normalized = normalizeForHash(redactSensitive(input))
  const digest = createHmac("sha256", PROCESS_FINGERPRINT_KEY).update(normalized).digest("hex").slice(0, 16)
  return `${prefix}:${digest}`
}

export function normalizeForHash(input: string): string {
  return input
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<uuid>")
    .replace(/\b\d{2,5}\b/g, "<num>")
    .replace(/\/tmp\/[^\s]+/g, "/tmp/<path>")
    .replace(/[A-Za-z]:\\Users\\[^\\\s]+/gi, "<user-home>")
    .replace(/\/home\/[^/\s]+/g, "<user-home>")
    .replace(/line \d+/gi, "line <num>")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

export function classifyTool(tool: string): "shell" | "read" | "search" | "edit" | "consultation" | "other" {
  const tokens = tool.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  if (tokens.some((token) => ["bash", "shell", "terminal", "exec", "command"].includes(token))) return "shell"
  if (tokens.some((token) => ["read", "cat", "open", "fetch"].includes(token))) return "read"
  if (tokens.some((token) => ["grep", "glob", "search", "find", "query"].includes(token))) return "search"
  if (tokens.some((token) => ["edit", "write", "patch", "applypatch", "create", "update"].includes(token))) return "edit"
  if (tokens.some((token) => ["agent", "review", "consult", "task", "oracle"].includes(token))) return "consultation"
  return "other"
}
