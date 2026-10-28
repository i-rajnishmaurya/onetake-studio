export class ProviderError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, code?: string, detail?: unknown, providerId?: string }} [opts]
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = "ProviderError";
    this.status = opts.status ?? 502;
    this.code = opts.code ?? "provider_error";
    this.detail = opts.detail;
    this.providerId = opts.providerId;
  }
}

/**
 * Redact secrets from a string for logging / error messages.
 */
export function redact(text) {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "sk-…REDACTED")
    .replace(/Bearer\s+[a-zA-Z0-9._-]{10,}/gi, "Bearer …REDACTED")
    .replace(/api[_-]?key["\s:=]+[a-zA-Z0-9._-]{10,}/gi, "api_key=…REDACTED")
    .replace(/["']?(key|token|secret|password)["']?\s*[:=]\s*["']?[a-zA-Z0-9._-]{8,}["']?/gi, "$1=…REDACTED");
}
