import { ProviderError, redact } from "../errors.js";

export default {
  id: "google",
  name: "Google Gemini",
  auth: {
    type: "api-key",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        placeholder: "AIza…",
        required: true,
        secret: true,
      },
    ],
  },
  docsUrl: "https://ai.google.dev/docs",
  limitations: null,
  supports: { modelDiscovery: true, streaming: false },
  contextWindow: 1000000,

  async validate(credentials) {
    const errors = [];
    if (!credentials?.apiKey) errors.push({ field: "apiKey", message: "API key required" });
    return { ok: errors.length === 0, errors };
  },

  async listModels(credentials) {
    const key = credentials.apiKey;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => {
          const id = (m.name || "").replace(/^models\//, "");
          return { id, label: m.displayName || id };
        });
    } catch {
      return [
        { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
        { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
        { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
        { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
        { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
      ];
    }
  },

  async chat({ credentials, model, system, messages = [], maxTokens = 8192, temperature = 0.7, signal }) {
    const key = credentials.apiKey;
    if (!key) throw new ProviderError("Missing API key", { providerId: "google" });

    const contents = [];
    for (const m of messages) {
      contents.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: typeof m.content === "string" ? m.content : String(m.content) }],
      });
    }

    const body = {
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
      },
    };
    if (system) {
      body.systemInstruction = { parts: [{ text: system }] };
    }

    const modelId = model.startsWith("models/") ? model : `models/${model}`;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${modelId}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: signal || AbortSignal.timeout(300000),
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ProviderError(redact(`Gemini (${res.status}): ${text.slice(0, 400)}`), {
        status: res.status,
        providerId: "google",
      });
    }

    const data = await res.json();
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    const usage = data.usageMetadata
      ? {
          promptTokens: data.usageMetadata.promptTokenCount ?? 0,
          completionTokens: data.usageMetadata.candidatesTokenCount ?? 0,
        }
      : undefined;
    return { text, usage };
  },
};
