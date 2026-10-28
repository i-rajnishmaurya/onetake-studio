import { createOpenAICompatible } from "../openaiCompatible.js";

export default createOpenAICompatible({
  id: "openrouter",
  name: "OpenRouter",
  baseUrl: "https://openrouter.ai/api/v1",
  docsUrl: "https://openrouter.ai/docs",
  contextWindow: 200000,
  defaultModels: [
    "openai/gpt-4o",
    "anthropic/claude-sonnet-4",
    "google/gemini-2.0-flash-001",
  ],
  headersExtra: () => ({
    "HTTP-Referer": process.env.PUBLIC_URL || "http://localhost:8787",
    "X-Title": "OneTake Studio",
  }),
});
