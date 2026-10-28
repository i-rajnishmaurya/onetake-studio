import { ProviderError, redact } from "../errors.js";

export default {
  id: "cohere",
  name: "Cohere",
  auth: {
    type: "api-key",
    fields: [{ key: "apiKey", label: "API Key", placeholder: "…", required: true, secret: true }],
  },
  docsUrl: "https://docs.cohere.com",
  supports: { modelDiscovery: true, streaming: false },
  contextWindow: 128000,

  async validate(c) {
    return { ok: !!c?.apiKey, errors: c?.apiKey ? [] : [{ field: "apiKey", message: "required" }] };
  },

  async listModels(credentials) {
    try {
      const res = await fetch("https://api.cohere.com/v1/models", {
        headers: { Authorization: `Bearer ${credentials.apiKey}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      return (data.models || [])
        .filter((m) => m.endpoints?.includes("chat") || m.finetuned === false)
        .map((m) => ({ id: m.name, label: m.name }));
    } catch {
      return [
        { id: "command-r-plus", label: "Command R+" },
        { id: "command-r", label: "Command R" },
        { id: "command-a-03-2025", label: "Command A" },
      ];
    }
  },

  async chat({ credentials, model, system, messages = [], maxTokens = 8192, temperature = 0.7, signal }) {
    const key = credentials.apiKey;
    if (!key) throw new ProviderError("Missing key", { providerId: "cohere" });
    const chatHistory = [];
    let lastUser = "";
    for (const m of messages) {
      if (m.role === "assistant") {
        chatHistory.push({ role: "CHATBOT", message: String(m.content) });
      } else {
        lastUser = String(m.content);
        if (chatHistory.length || system) {
          // previous turns already in history
        }
      }
    }
    // Simplify: use last user message as message, prior as history
    const body = {
      model,
      message: lastUser || (messages[messages.length - 1]?.content ?? ""),
      chat_history: messages.slice(0, -1).map((m) => ({
        role: m.role === "assistant" ? "CHATBOT" : "USER",
        message: String(m.content),
      })),
      max_tokens: maxTokens,
      temperature,
    };
    if (system) body.preamble = system;

    const res = await fetch("https://api.cohere.com/v1/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: signal || AbortSignal.timeout(300000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new ProviderError(redact(`Cohere (${res.status}): ${t.slice(0, 300)}`), {
        status: res.status,
        providerId: "cohere",
      });
    }
    const data = await res.json();
    return {
      text: data.text || data.message?.content?.[0]?.text || "",
      usage: data.meta?.tokens
        ? {
            promptTokens: data.meta.tokens.input_tokens ?? 0,
            completionTokens: data.meta.tokens.output_tokens ?? 0,
          }
        : undefined,
    };
  },
};
