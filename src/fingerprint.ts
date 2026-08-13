import { createHash } from "node:crypto"

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{12,}/g,
  /gh[pousr]_[A-Za-z0-9_]{12,}/g,
  /xox[baprs]-[A-Za-z0-9-]{12,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /(?<key>token|secret|password|apikey|api_key|authorization)\s*[=:]\s*[^\s"']+/gi,
]

export function redactSensitive(input: unknown): string {
  let text = typeof input === "string" ? input : JSON.stringify(input ?? "")
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, "$<key>=<redacted>")
  return text
}

export function stableFingerprint(input: unknown, prefix = "fp"): string {
  const normalized = normalizeForHash(redactSensitive(input))
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 16)
  return `${prefix}:${digest}`
}

export function normalizeForHash(input: string): string {
  return input
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<uuid>")
    .replace(/\b\d{2,5}\b/g, "<num>")
    .replace(/\/tmp\/[^\s]+/g, "/tmp/<path>")
    .replace(/line \d+/gi, "line <num>")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

export function classifyTool(tool: string): "shell" | "read" | "search" | "edit" | "consultation" | "other" {
  const name = tool.toLowerCase()
  if (["bash", "shell", "terminal"].some((part) => name.includes(part))) return "shell"
  if (["read", "cat", "open"].some((part) => name.includes(part))) return "read"
  if (["grep", "glob", "search", "find"].some((part) => name.includes(part))) return "search"
  if (["edit", "write", "patch"].some((part) => name.includes(part))) return "edit"
  if (["agent", "review", "consult", "task"].some((part) => name.includes(part))) return "consultation"
  return "other"
}
