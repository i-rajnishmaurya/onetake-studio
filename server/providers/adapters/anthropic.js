import { ProviderError, redact } from "../errors.js";

export default {
  id: "anthropic",
  name: "Anthropic",
  auth: {
    type: "api-key",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        placeholder: "sk-ant-…",
        required: true,
        secret: true,
      },
    ],
  },
  docsUrl: "https://docs.anthropic.com",
  limitations: null,
  supports: { modelDiscovery: false, streaming: false },
  contextWindow: 200000,

  async validate(credentials) {
    const errors = [];
    if (!credentials?.apiKey) errors.push({ field: "apiKey", message: "API key required" });
    return { ok: errors.length === 0, errors };
  },

  async listModels() {
    return [
      { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
      { id: "claude-opus-4-20250514", label: "Claude Opus 4" },
      { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
      { id: "claude-3-opus-20240229", label: "Claude 3 Opus" },
    ];
  },

  async chat({ credentials, model, system, messages = [], maxTokens = 8192, temperature = 0.7, signal }) {
    const key = credentials.apiKey;
    if (!key) throw new ProviderError("Missing API key", { providerId: "anthropic" });

    const body = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: typeof m.content === "string" ? m.content : String(m.content),
      })),
    };
    if (system) body.system = system;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: signal || AbortSignal.timeout(300000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ProviderError(redact(`Anthropic (${res.status}): ${text.slice(0, 400)}`), {
        status: res.status,
        providerId: "anthropic",
      });
    }

    const data = await res.json();
    const text = (data.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");
    const usage = data.usage
      ? {
          promptTokens: data.usage.input_tokens ?? 0,
          completionTokens: data.usage.output_tokens ?? 0,
        }
      : undefined;
    return { text, usage };
  },
};
