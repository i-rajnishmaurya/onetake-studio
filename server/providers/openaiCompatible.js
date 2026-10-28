import { ProviderError, redact } from "./errors.js";

/**
 * Build a standard OpenAI-compatible chat adapter.
 * @param {object} cfg
 */
export function createOpenAICompatible(cfg) {
  const {
    id,
    name,
    baseUrl,
    docsUrl,
    limitations = null,
    supports = { modelDiscovery: true, streaming: false },
    contextWindow = null,
    defaultModels = [],
    authFields = [
      {
        key: "apiKey",
        label: "API Key",
        placeholder: "sk-…",
        required: true,
        secret: true,
      },
    ],
    headersExtra = () => ({}),
    modelsPath = "/models",
    chatPath = "/chat/completions",
    modelIdPrefix = null,
  } = cfg;

  return {
    id,
    name,
    auth: {
      type: "api-key",
      fields: authFields,
    },
    docsUrl,
    limitations,
    supports,
    contextWindow,

    async validate(credentials) {
      const errors = [];
      if (!credentials?.apiKey || typeof credentials.apiKey !== "string") {
        errors.push({ field: "apiKey", message: "API key is required" });
      }
      return { ok: errors.length === 0, errors };
    },

    async listModels(credentials) {
      const key = credentials.apiKey;
      if (!key) throw new ProviderError("Missing API key", { providerId: id });
      try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}${modelsPath}`, {
          headers: {
            Authorization: `Bearer ${key}`,
            ...headersExtra(credentials),
          },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new ProviderError(
            redact(`Models list failed (${res.status}): ${body.slice(0, 200)}`),
            { status: res.status, providerId: id }
          );
        }
        const data = await res.json();
        const list = Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.models)
            ? data.models
            : Array.isArray(data)
              ? data
              : [];
        return list
          .map((m) => {
            const mid = m.id || m.name || m.model;
            if (!mid) return null;
            return { id: mid, label: m.name || mid };
          })
          .filter(Boolean)
          .sort((a, b) => a.id.localeCompare(b.id));
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        // Fallback to documented defaults when discovery fails
        if (defaultModels.length) {
          return defaultModels.map((m) =>
            typeof m === "string" ? { id: m, label: m } : m
          );
        }
        throw new ProviderError(redact(err.message || "listModels failed"), {
          providerId: id,
        });
      }
    },

    async chat({
      credentials,
      model,
      system,
      messages = [],
      maxTokens = 8192,
      temperature = 0.7,
      signal,
    }) {
      const key = credentials.apiKey;
      if (!key) throw new ProviderError("Missing API key", { providerId: id });

      const fullMessages = [];
      if (system) {
        fullMessages.push({ role: "system", content: system });
      }
      for (const m of messages) {
        fullMessages.push({
          role: m.role === "assistant" ? "assistant" : "user",
          content: typeof m.content === "string" ? m.content : String(m.content),
        });
      }

      const body = {
        model: modelIdPrefix ? `${modelIdPrefix}${model}` : model,
        messages: fullMessages,
        max_tokens: maxTokens,
        temperature,
      };

      const res = await fetch(`${baseUrl.replace(/\/$/, "")}${chatPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          ...headersExtra(credentials),
        },
        body: JSON.stringify(body),
        signal: signal || AbortSignal.timeout(300000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new ProviderError(
          redact(`Chat failed (${res.status}): ${text.slice(0, 400)}`),
          { status: res.status, providerId: id, detail: text.slice(0, 500) }
        );
      }

      const data = await res.json();
      const choice = data.choices?.[0];
      const text =
        choice?.message?.content ??
        choice?.text ??
        data.output_text ??
        "";
      const usage = data.usage
        ? {
            promptTokens: data.usage.prompt_tokens ?? data.usage.input_tokens ?? 0,
            completionTokens:
              data.usage.completion_tokens ?? data.usage.output_tokens ?? 0,
          }
        : undefined;
      return { text: String(text), usage };
    },
  };
}
