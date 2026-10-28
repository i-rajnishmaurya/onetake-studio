import { createOpenAICompatible } from "../openaiCompatible.js";

export default createOpenAICompatible({
  id: "perplexity",
  name: "Perplexity",
  baseUrl: "https://api.perplexity.ai",
  docsUrl: "https://docs.perplexity.ai",
  contextWindow: 128000,
  defaultModels: [
    "sonar-pro",
    "sonar",
    "sonar-reasoning-pro",
  ],
  modelsPath: "/models", // may 404 → fallback
});
